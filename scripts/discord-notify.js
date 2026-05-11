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
    const link    = body.match(/<link>(.*?)<\/link>/)?.[1]?.trim() ?? '';
    const pubDate = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    if (title) items.push({ title, link, pubDate, ts: pubDate ? new Date(pubDate).getTime() : 0 });
  }
  return items;
}

// ── KST 오늘 날짜 문자열 ──────────────────────────────────────────────────────
function kstDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

// ── 원고 제목에서 아티스트명 포함 여부 확인 ──────────────────────────────────
function isPublished(manuscript, rssItems) {
  const { slug, title } = manuscript;
  return rssItems.some(r =>
    r.title.includes(slug) ||
    r.title.includes(title.replace(/^\[.*?\]\s*/, '').slice(0, 15))
  );
}

// ── Discord 임베드 전송 ───────────────────────────────────────────────────────
async function sendEmbed(embeds) {
  const res = await fetch(WEBHOOK, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ embeds }),
  });
  if (!res.ok) throw new Error(`Discord 전송 실패: ${res.status} ${await res.text()}`);
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
const AGENCY_LABEL = {
  mih_speaker: '스피커',
  mih_casting: '캐스팅',
  mih_agency:  '에이전시',
  mih_history: '이전발행',
};
const AGENCY_COLOR = {
  mih_speaker: 0x1565C0,
  mih_casting: 0x7B1FA2,
  mih_agency:  0x2E7D32,
  mih_history: 0x546E7A,
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

  // 당일 등록 원고
  const todayMss = manuscripts.filter(m => m.date === todayStr);

  // 발행 여부 판단
  const unpublished = todayMss.filter(m => !isPublished(m, rssMap[m.agency] ?? []));
  const published   = todayMss.filter(m =>  isPublished(m, rssMap[m.agency] ?? []));

  // ── 당일 원고 목록 ────────────────────────────────────────────────────────
  const todayLines = todayMss.length === 0
    ? '오늘 등록된 원고가 없습니다.'
    : todayMss.map(m => {
        const done = isPublished(m, rssMap[m.agency] ?? []);
        return `${done ? '✅' : '⏳'} [${AGENCY_LABEL[m.agency]}] **${m.slug}**`;
      }).join('\n');

  // ── 임베드 구성 ──────────────────────────────────────────────────────────
  const fields = [
    {
      name:   `🗓 오늘 원고 (${todayMss.length}개 등록 / ${published.length}개 발행 확인)`,
      value:  todayLines.slice(0, 1024),
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
    title:     `📋 MIH 오늘 발행 현황 · ${todayStr}`,
    color:     0x1565C0,
    fields,
    footer:    { text: 'MIH Blog Writer · 매일 10:00 KST' },
    timestamp: new Date().toISOString(),
  }]);

  console.log(`Discord 알림 전송 완료 (${todayStr})`);
}

main().catch(e => { console.error(e); process.exit(1); });
