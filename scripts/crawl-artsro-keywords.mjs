// scripts/crawl-artsro-keywords.mjs
// artsro.com 인물 목록 크롤러 → keywords 테이블 신규 추가 + agency 설정
//
// 사용법:
//   node scripts/crawl-artsro-keywords.mjs           # dry-run (쓰기 없음)
//   node scripts/crawl-artsro-keywords.mjs --apply    # 신규 행 upsert

import { pathToFileURL } from 'node:url';

// ── 정규화 (pick-keywords.mjs와 동일) ───────────────────────────────────────
export const stripParen = (s) => (s || '').replace(/[\(（].*$/s, '').trim();
export const norm = (s) => stripParen(s).replace(/\s+/g, '').toLowerCase();

// ── CatNo → category/agency 매핑 ────────────────────────────────────────────
const SPEAKER = new Set([87, 88, 90, 95, 97, 129, 91, 92, 93, 94, 96]);
const GAGMAN = new Set([85, 86]);
const BROADCAST = new Set([89, 83, 84, 114, 69, 71, 72, 73]);

// 그 외 전부(가수) — 순회 대상 전체 목록. 사이트 네비 트리에서 추출.
const SINGER = [
  74, 75, 76, 77, 78, 79, 80, 81, 82,            // 연예인 가수 세부
  17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31, // 음악
  33, 34, 35, 36, 37, 38, 39, 40,                // 댄스
  41, 42, 43, 44, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, // 퍼포먼스
  58, 59, 60, 61, 103, 104,                      // 클래식
  62, 63, 64, 65, 66, 67, 68,                    // 전통
  107, 108, 109, 110, 111, 112, 133, 113,        // 기획공연
  116, 117, 118, 119, 120,                       // 외국인
];

export const ALL_CAT_NOS = [
  ...SPEAKER, ...GAGMAN, ...BROADCAST, ...SINGER,
];

export function classify(catNo) {
  const n = Number(catNo);
  if (SPEAKER.has(n)) return { category: '강연자', agency: 'mih_speaker', split: false };
  if (GAGMAN.has(n)) return { category: '개그맨', agency: null, split: true };
  if (BROADCAST.has(n)) return { category: '방송인', agency: null, split: true };
  return { category: '가수', agency: null, split: true };
}

export function parseListPage(html) {
  const re =
    /enter_view\.html\?GoIdx=(\d+)[^"]*"[\s\S]*?idol_title">([^<]+)<\/p>[\s\S]*?idol_txt"[^>]*>([^<]*)<\/p>/g;
  const out = [];
  for (const m of (html || '').matchAll(re)) {
    out.push({ goIdx: m[1], name: m[2].trim(), desc: m[3].trim() });
  }
  return out;
}

export function isDuplicate(name, excludedSet) {
  const kn = norm(name);
  if (!kn) return false;
  if (excludedSet.has(kn)) return true;
  for (const ex of excludedSet) {
    if (!ex) continue;
    if (kn.startsWith(ex) || ex.startsWith(kn)) return true;
  }
  return false;
}

export function buildRow({ goIdx, name, desc, catNo }, agency) {
  const { category } = classify(catNo);
  const url = `https://www.artsro.com/right/enter_view.html?GoIdx=${goIdx}&CatNo=${catNo}`;
  const notes = desc ? `${desc} | ${url}` : url;
  return { id: `artsro-${goIdx}`, keyword: name, category, agency, notes, is_active: true };
}

const PAGE_SIZE = 15;

export async function crawlCategory(catNo, fetchPage) {
  const acc = [];
  const seen = new Set();
  for (let start = 0; ; start += PAGE_SIZE) {
    const html = await fetchPage(catNo, start);
    const rows = parseListPage(html);
    if (rows.length === 0) break;
    let fresh = 0;
    for (const r of rows) {
      if (seen.has(r.goIdx)) continue;
      seen.add(r.goIdx);
      acc.push(r);
      fresh++;
    }
    if (fresh === 0) break; // 새 항목 없음(clamp된 마지막 페이지) → 종료
  }
  return acc;
}

const ENT_ACCOUNTS = ['mih_casting', 'mih_agency', 'other'];
export function makeSplitter() {
  let i = 0;
  return () => ENT_ACCOUNTS[i++ % ENT_ACCOUNTS.length];
}

async function main() {
  // Task 5에서 구현
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
