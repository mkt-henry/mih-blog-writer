// scripts/crawl-hooh-keywords.mjs
// 호오컨설팅(hooh.kr) 강사 목록 크롤러 → keywords 테이블 신규 추가 (전원 강연자/mih_speaker)
//
// 사용법:
//   node scripts/crawl-hooh-keywords.mjs           # dry-run (쓰기 없음)
//   node scripts/crawl-hooh-keywords.mjs --apply    # 신규 행 upsert

import { pathToFileURL } from 'node:url';
import { supabaseSelect, supabaseUpsert } from './lib/supabase-rest.js';
import { loadEnv } from './lib/env.js';
import { norm, isDuplicate, collectOutputNames } from './crawl-artsro-keywords.mjs';

loadEnv();

const LIST_RE =
  /next\.asp\?m_idx=(\d+)"[\s\S]*?class="lname[^"]*">[\s\S]*?<p>([^<]+)<\/p>\s*<span>([^<]*)<\/span>[\s\S]*?<p class="cate">([^<]*)<\/p>/g;

export function parseListPage(html) {
  const out = [];
  for (const m of (html || '').matchAll(LIST_RE)) {
    out.push({ idx: m[1], name: m[2].trim(), title: m[3].trim(), cate: m[4].trim() });
  }
  return out;
}

export function buildRow({ idx, name, title, cate }) {
  const notes = [title, cate].map((s) => (s || '').trim()).filter(Boolean).join(' | ');
  return {
    id: `hooh-${idx}`,
    keyword: name,
    category: '강연자',
    agency: 'mih_speaker',
    notes,
    source: `https://www.hooh.kr/sub/teacher/next.asp?m_idx=${idx}`,
    is_active: true,
  };
}

export async function crawlAll(fetchPage, { maxPage = 300 } = {}) {
  const acc = [];
  const seen = new Set();
  for (let page = 1; page <= maxPage; page++) {
    const html = await fetchPage(page);
    const rows = parseListPage(html);
    if (rows.length === 0) break;          // 마지막 페이지 도달
    let fresh = 0;
    for (const r of rows) {
      if (seen.has(r.idx)) continue;
      seen.add(r.idx);
      acc.push(r);
      fresh++;
    }
    if (fresh === 0) break;                // clamp된 반복 페이지 → 종료
  }
  return acc;
}

const AJAX_URL = 'https://www.hooh.kr/ajax/teacher_list.asp';
const UA = 'Mozilla/5.0 (compatible; mih-blog-writer/1.0)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(page) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(AJAX_URL, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `page=${page}&sort=0`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await sleep(400); // 예의상 rate limit
      return html;
    } catch (e) {
      lastErr = e;
      await sleep(800 * (attempt + 1)); // 백오프
    }
  }
  console.warn(`  ⚠ fetch 실패(스킵): page=${page} — ${lastErr?.message}`);
  return ''; // 빈 페이지 → 종료 신호
}

async function main() {
  const apply = process.argv.includes('--apply');

  // 1) 제외(중복) 집합: 기존 keywords + articles + output/ 발행대기
  const [kw, arts] = await Promise.all([
    supabaseSelect('keywords', { columns: 'keyword' }),
    supabaseSelect('articles', { columns: 'person_name' }),
  ]);
  const excluded = new Set();
  for (const k of kw || []) excluded.add(norm(k.keyword));
  for (const a of arts || []) excluded.add(norm(a.person_name));
  collectOutputNames('output', excluded);

  // 2) 전수 크롤링
  const people = await crawlAll(fetchPage);
  if (people.length === 0) {
    console.error('전체 수집 0건 — 사이트 마크업이 변경되었을 수 있습니다.');
    process.exit(1);
  }

  // 3) 중복 판정 → 신규만
  const newRows = [];
  const dupNames = [];
  const seenThisRun = new Set();
  for (const p of people) {
    const nn = norm(p.name);
    if (isDuplicate(p.name, excluded) || isDuplicate(p.name, seenThisRun)) { dupNames.push(p.name); continue; }
    seenThisRun.add(nn);
    newRows.push(buildRow(p));
  }

  // 4) 리포트
  console.log('\n=== hooh 크롤 결과 ===');
  console.log(`전체 수집 ${people.length} / 신규 ${newRows.length} / 중복(스킵) ${dupNames.length}\n`);
  console.log(`■ 강연자/mih_speaker (${newRows.length})`);
  newRows.forEach((r, i) => console.log(`  ${i + 1}. ${r.keyword}  — ${r.notes}`));

  if (!apply) {
    console.log('\n실제 추가하려면 --apply 로 재실행하세요.');
    return;
  }

  // 5) upsert (청크 200, id 멱등)
  let inserted = 0;
  const total = newRows.length;
  for (let i = 0; i < total; i += 200) {
    const chunk = newRows.slice(i, i + 200);
    try {
      await supabaseUpsert('keywords', chunk, { onConflict: 'id' });
    } catch (e) {
      console.error(`upsert 실패: ${inserted}/${total}건까지 반영됨. 청크 ${i}~${i + chunk.length} 실패 — ${e.message}`);
      console.error('id 기준 멱등이므로 그대로 재실행하면 이어서 반영됩니다.');
      throw e;
    }
    inserted += chunk.length;
    console.log(`  upsert 진행 ${inserted}/${total}`);
  }
  console.log(`완료: ${inserted}건 upsert.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
