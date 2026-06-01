/**
 * MIH 발행 현황 Discord 알림
 *
 * manifest.js 원고 목록과 각 계정 네이버 RSS를 비교해
 * 발행 여부를 정리하고 Discord 웹훅으로 전송한다.
 *
 * 실행: node scripts/discord-notify.js
 * 환경변수: DISCORD_WEBHOOK_URL
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

if (!WEBHOOK) {
  console.error('DISCORD_WEBHOOK_URL 환경변수가 없습니다.');
  process.exit(1);
}

// ── manifest.js 로드 ──────────────────────────────────────────────────────────
function loadManifest() {
  const raw  = readFileSync(join(ROOT, 'output', 'manifest.js'), 'utf8');
  const json = raw.replace(/^\/\/[^\n]*\n/, '').replace(/^window\.MIH\s*=\s*/, '').replace(/;\s*$/, '');
  return JSON.parse(json);
}

// ── RSS 가져오기 ──────────────────────────────────────────────────────────────
async function fetchRss(blogSlug) {
  const url = `https://rss.blog.naver.com/${blogSlug}`;
  const res  = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MIH-Notifier/1.0)' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text());
}

// ── RSS XML 파싱 ──────────────────────────────────────────────────────────────
function parseRss(xml) {
  const items = [];
  for (const [, body] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title   = (body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? body.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? '';
    const rawLink = body.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? '';
    const link    = rawLink.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    const pubDate = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    if (title) items.push({ title, link, pubDate, ts: pubDate ? new Date(pubDate).getTime() : 0 });
  }
  return items;
}

// ── KST 날짜/시각 유틸 ───────────────────────────────────────────────────────
function kstDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

function kstTimeStr(ts) {
  // ts: ms 타임스탬프 → KST HH:MM
  return new Date(ts + 9 * 3600_000).toISOString().slice(11, 16);
}

function isKstToday(ts, todayStr) {
  return new Date(ts + 9 * 3600_000).toISOString().slice(0, 10) === todayStr;
}


// ── Discord 전송 ─────────────────────────────────────────────────────────────
async function sendEmbed(embeds) {
  const res = await fetch(WEBHOOK, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ embeds }),
  });
  if (!res.ok) throw new Error(`Discord 전송 실패: ${res.status} ${await res.text()}`);
}

async function sendContent(content) {
  const res = await fetch(WEBHOOK, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Discord 전송 실패: ${res.status} ${await res.text()}`);
}

// ── RSS 항목 → 원고 슬러그 매칭 ─────────────────────────────────────────────
function findSlug(rssTitle, manuscripts) {
  const m = manuscripts.find(ms =>
    rssTitle.includes(ms.slug) ||
    rssTitle.includes(ms.title.replace(/^\[.*?\]\s*/, '').slice(0, 15))
  );
  return m ? m.slug : null;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
const AGENCY_LABEL = {
  mih_speaker: '스피커',
  mih_casting: '캐스팅',
  mih_agency:  '에이전시',
  kyh620303:   'kyh620303',
};
const AGENCY_COLOR = {
  mih_speaker: 0x1565C0,
  mih_casting: 0x7B1FA2,
  mih_agency:  0x2E7D32,
  kyh620303:   0xE65100,
};

async function main() {
  const MIH = loadManifest();
  const { manuscripts, agencies } = MIH;

  const todayStr = kstDateStr(0);

  // ── 계정별 RSS 수집 ───────────────────────────────────────────────────────
  const rssMap = {};
  const rssErrors = [];

  await Promise.allSettled(
    Object.entries(agencies).map(async ([slug, agency]) => {
      try {
        rssMap[slug] = await fetchRss(agency.blogSlug);
      } catch (e) {
        rssMap[slug] = [];
        rssErrors.push(`${AGENCY_LABEL[slug] ?? slug}: ${e.message}`);
      }
    })
  );

  // ── 계정별 집계 ───────────────────────────────────────────────────────────
  const agencySlugs = Object.keys(agencies);

  // RSS 기준 오늘 발행된 항목 (계정별)
  const publishedToday = {};
  for (const slug of agencySlugs) {
    publishedToday[slug] = (rssMap[slug] ?? [])
      .filter(r => r.ts && isKstToday(r.ts, todayStr))
      .sort((a, b) => a.ts - b.ts);
  }


  // ── RSS 발행 내역 필드 ────────────────────────────────────────────────────
  const rssField = agencySlugs
    .map(slug => {
      const items = publishedToday[slug];
      if (items.length === 0) return null;
      const lines = items.map(r => {
        const t = r.title.length > 30 ? r.title.slice(0, 30) + '…' : r.title;
        return `  \`${kstTimeStr(r.ts)}\` ${t}`;
      }).join('\n');
      return `**[${AGENCY_LABEL[slug]}]**\n${lines}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const totalPublished = agencySlugs.reduce((s, slug) => s + publishedToday[slug].length, 0);

  // ── 임베드 구성 ──────────────────────────────────────────────────────────
  const fields = [
    {
      name:  `📡 오늘 발행 (${totalPublished}건)`,
      value: (rssField || '아직 발행된 원고가 없습니다.').slice(0, 1024),
      inline: false,
    },
  ];

  if (rssErrors.length > 0) {
    fields.push({
      name:   '⚠️ RSS 수집 오류',
      value:  rssErrors.join('\n').slice(0, 512),
      inline: false,
    });
  }

  await sendEmbed([{
    title:     `📋 MIH 발행 현황 · ${todayStr}`,
    color:     0x1565C0,
    fields,
    footer:    { text: 'MIH Blog Writer · 매일 10:00 KST' },
    timestamp: new Date().toISOString(),
  }]);

  // ── 두 번째 메시지: 날짜 · 키워드 · URL ──────────────────────────────────
  const allTodayItems = agencySlugs.flatMap(slug =>
    publishedToday[slug].map(r => ({ ...r, agencySlug: slug }))
  ).sort((a, b) => a.ts - b.ts);

  if (allTodayItems.length > 0) {
    const lines = allTodayItems.map(r => {
      const keyword = findSlug(r.title, manuscripts) ?? r.title.slice(0, 20);
      return `${keyword} 섭외\n${r.link}`;
    });
    await sendContent(`▶ ${todayStr}\n\n${lines.join('\n\n')}`);
  }

  console.log(`Discord 알림 전송 완료 (${todayStr})`);
}

main().catch(e => { console.error(e); process.exit(1); });
