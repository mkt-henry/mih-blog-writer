// scripts/crawl-artsro-keywords.mjs
// artsro.com 인물 목록 크롤러 → keywords 테이블 신규 추가 + agency 설정
//
// 사용법:
//   node scripts/crawl-artsro-keywords.mjs           # dry-run (쓰기 없음)
//   node scripts/crawl-artsro-keywords.mjs --apply    # 신규 행 upsert

import { pathToFileURL } from 'node:url';
import { supabaseSelect, supabaseUpsert } from './lib/supabase-rest.js';
import { loadEnv } from './lib/env.js';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { norm, titleName, fileNames } from '../lib/name-match.mjs';

loadEnv();

// ── 정규화·중복 판정은 lib/name-match.mjs 단일 구현을 쓴다 (pick-keywords.mjs 와 동일 규칙) ──
// 기존 import 경로 호환을 위해 여기서 재수출한다.
export { stripParen, norm, isExcluded as isDuplicate } from '../lib/name-match.mjs';

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

export function buildRow({ goIdx, name, desc, catNo }, agency) {
  const { category } = classify(catNo);
  // 출처(artsro 상세 URL)는 source 컬럼에 따로 기록, notes 에는 소개글만 남긴다.
  const source = `https://www.artsro.com/right/enter_view.html?GoIdx=${goIdx}&CatNo=${catNo}`;
  return { id: `artsro-${goIdx}`, keyword: name, category, agency, notes: desc, source, is_active: true };
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

// Fisher-Yates 셔플 (assign-keyword-agency.mjs와 동일)
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// output/ 폴더의 html 파일명에서 인물명을 제외 집합에 추가 (pick-keywords.mjs와 동일)
// 파일명 접두 슬러그와 "[인물명 섭외]" 대괄호 이름을 모두 넣는다.
export function collectOutputNames(dir, acc) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) collectOutputNames(p, acc);
    else if (e.toLowerCase().endsWith('.html')) {
      for (const n of fileNames(e)) acc.add(n);
    }
  }
  return acc;
}

const BASE = 'https://www.artsro.com/right/enter_list.html';
const UA = 'Mozilla/5.0 (compatible; mih-blog-writer/1.0)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(catNo, start) {
  const url = `${BASE}?CatNo=${catNo}&start=${start}`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await sleep(400); // 예의상 rate limit
      return html;
    } catch (e) {
      lastErr = e;
      await sleep(800 * (attempt + 1)); // 백오프
    }
  }
  console.warn(`  ⚠ fetch 실패(스킵): CatNo=${catNo} start=${start} — ${lastErr?.message}`);
  return ''; // 빈 페이지 → 해당 CatNo 종료 신호
}

async function main() {
  const apply = process.argv.includes('--apply');

  // 1) 기존 DB 키워드/원고 인물명 + output/ 파일명 → 제외(중복) 집합
  const [kw, arts] = await Promise.all([
    supabaseSelect('keywords', { columns: 'keyword' }),
    // 제목까지 받는다 — person_name 이 로마자 슬러그(bumsup 등)로 저장된 원고가 있어
    // person_name 만으로는 이미 원고가 있는 한글 인물명을 놓친다.
    supabaseSelect('articles', { columns: 'person_name,title' }),
  ]);
  const excluded = new Set();
  for (const k of kw || []) excluded.add(norm(k.keyword));
  for (const a of arts || []) {
    for (const n of [norm(a.person_name), titleName(a.title)].filter(Boolean)) excluded.add(n);
  }
  collectOutputNames('output', excluded); // 발행 대기 원고(output/)도 제외

  // 2) 전체 CatNo 순회 크롤링 — 신규 인물만 수집(계정 배정은 이후)
  const pending = []; // { p, catNo, category, split, fixedAgency, agency? }
  const seenThisRun = new Set(); // 같은 인물이 여러 CatNo에 중복 등장 방지
  let totalCrawled = 0;
  let dup = 0;

  for (const catNo of ALL_CAT_NOS) {
    const people = await crawlCategory(catNo, fetchPage);
    totalCrawled += people.length;
    if (people.length === 0) {
      console.warn(`  ⚠ CatNo=${catNo}: 수집 0건`);
      continue;
    }
    const { category, agency: fixedAgency, split } = classify(catNo);
    for (const p of people) {
      const nn = norm(p.name);
      if (isDuplicate(p.name, excluded) || isDuplicate(p.name, seenThisRun)) { dup++; continue; }
      seenThisRun.add(nn);
      pending.push({ p, catNo, category, split, fixedAgency });
    }
    console.log(`  CatNo=${catNo} [${category}] 수집 ${people.length}`);
  }

  // 3) 방어: 전체 0건이면 비정상 → 실패 처리
  if (totalCrawled === 0) {
    console.error('전체 수집 0건 — 사이트 마크업이 변경되었을 수 있습니다.');
    process.exit(1);
  }

  // 4) 계정 배정 — split 대상은 셔플 후 라운드로빈(랜덤·균등), 강연자는 mih_speaker 고정
  const splitter = makeSplitter();
  shuffle(pending.filter((e) => e.split)).forEach((e) => { e.agency = splitter(); });
  for (const e of pending) if (!e.split) e.agency = e.fixedAgency;

  // 5) 행 생성 + 리포트 버킷
  const newRows = [];
  const byBucket = {}; // `${category}/${agency}` → [name]
  for (const e of pending) {
    newRows.push(buildRow({ ...e.p, catNo: e.catNo }, e.agency));
    const bucket = `${e.category}/${e.agency}`;
    (byBucket[bucket] ||= []).push(e.p.name);
  }

  // 6) 리포트
  console.log('\n=== artsro 크롤 결과 ===');
  console.log(`전체 수집 ${totalCrawled} / 신규 ${newRows.length} / 중복(스킵) ${dup}\n`);
  for (const [bucket, names] of Object.entries(byBucket)) {
    console.log(`■ ${bucket} (${names.length})`);
    names.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
    console.log('');
  }

  if (!apply) {
    console.log('실제 추가하려면 --apply 로 재실행하세요.');
    return;
  }

  // 7) upsert (청크 200)
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
