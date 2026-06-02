#!/usr/bin/env node
// 계정 불일치 원고 수정: 다른 agency의 RSS에서 매칭해 published_at/url 업데이트

import { loadEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';
import { requireEnv } from './lib/env.js';

loadEnv();

const SLUGS = ['mih_speaker', 'mih_casting', 'mih_agency', 'other'];
const BLOG_SLUGS = {
  mih_speaker: 'mih_speaker',
  mih_casting: 'mih_casting',
  mih_agency: 'mih_agency',
  other: 'kyh620303',
};

function normalizeTitle(s) {
  return s.replace(/[ 　]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTitleKeyword(rawTitle) {
  const title = normalizeTitle(rawTitle);
  const m = title.match(/^\[([^\]]+?)(?:\s+섭외)?\]/);
  return m ? m[1].trim() : null;
}

function parseRss(xml, agency) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const title =
      (body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? body.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? '';
    const rawLink = body.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? '';
    const link = rawLink.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    const pubDate = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    const pub_ts = pubDate ? new Date(pubDate).getTime() : 0;
    if (title && link && pub_ts) items.push({ agency, title, link, pub_ts });
  }
  return items;
}

async function fetchRss(slug) {
  const blogSlug = BLOG_SLUGS[slug] ?? slug;
  const res = await fetch(`https://rss.blog.naver.com/${blogSlug}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MIH-RSS-Sync/1.0)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text(), slug);
}

async function supabaseUpdate(table, id, data) {
  const url = `${requireEnv('SUPABASE_URL')}/rest/v1/${table}?id=eq.${id}`;
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`update 실패: ${res.status} ${txt}`);
  }
}

// 모든 RSS 피드 수집
console.log('RSS 피드 수집 중...');
const allItems = [];
for (const slug of SLUGS) {
  try {
    const items = await fetchRss(slug);
    console.log(`  ${slug}: ${items.length}개`);
    allItems.push(...items);
  } catch (e) {
    console.error(`  ${slug} 오류: ${e.message}`);
  }
}
console.log(`  합계: ${allItems.length}개\n`);

// 발행 대기 원고 조회
const unpub = await supabaseSelect('articles', {
  columns: 'id,person_name,slug,title,agency,created_at',
  filter: 'published_at=is.null',
});
console.log(`발행 대기 원고: ${unpub.length}개\n`);

// cross-agency 매칭 (agency 무관)
let matchedCount = 0;
for (const item of allItems) {
  const keyword = extractTitleKeyword(item.title);
  if (!keyword) continue;

  // 동일 agency 먼저 제외 (정상 sync 대상) → 다른 agency만 cross-check
  const crossCandidates = unpub.filter((c) => c.agency !== item.agency);

  const personMatch = crossCandidates.find(
    (c) => normalizeTitle(c.person_name) === normalizeTitle(keyword)
  );
  const slugMatch = !personMatch && crossCandidates.find((c) => c.slug === keyword);
  const matched = personMatch || slugMatch;

  if (!matched) continue;

  console.log(`매칭: [${item.agency}] "${item.title}"`);
  console.log(`  → DB: ${matched.person_name} (${matched.agency}) id=${matched.id}`);
  console.log(`  → URL: ${item.link}`);
  console.log(`  → pub_ts: ${new Date(item.pub_ts).toISOString()}`);

  try {
    await supabaseUpdate('articles', matched.id, {
      published_at: new Date(item.pub_ts).toISOString(),
      published_url: item.link,
      published_source: 'rss',
    });
    console.log(`  ✓ DB 업데이트 완료\n`);
    matchedCount++;
    // unpub에서 제거해 중복 매칭 방지
    const idx = unpub.findIndex((c) => c.id === matched.id);
    if (idx >= 0) unpub.splice(idx, 1);
  } catch (e) {
    console.error(`  ✗ 업데이트 실패: ${e.message}\n`);
  }
}

console.log(`\n완료: ${matchedCount}개 업데이트`);
