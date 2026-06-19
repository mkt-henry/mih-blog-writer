// scripts/export-crawl-csv.mjs
// artsro.com / hooh.kr 전수 크롤링 → 사이트별 전체 리스트를 CSV로 저장 (DB 미반영)
//
// 사용법:
//   node scripts/export-crawl-csv.mjs            # 두 사이트 모두
//   node scripts/export-crawl-csv.mjs artsro     # artsro만
//   node scripts/export-crawl-csv.mjs hooh       # hooh만
//
// 출력: output/crawl/artsro-list.csv, output/crawl/hooh-list.csv (UTF-8 BOM)

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_CAT_NOS,
  classify,
  crawlCategory,
} from './crawl-artsro-keywords.mjs';
import { crawlAll } from './crawl-hooh-keywords.mjs';

const UA = 'Mozilla/5.0 (compatible; mih-blog-writer/1.0)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CSV 직렬화 ──────────────────────────────────────────────────────────────
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM + CRLF (엑셀 호환)
}

// ── artsro fetch (crawl-artsro-keywords.mjs와 동일 로직) ─────────────────────
const ARTSRO_BASE = 'https://www.artsro.com/right/enter_list.html';
async function fetchArtsro(catNo, start) {
  const url = `${ARTSRO_BASE}?CatNo=${catNo}&start=${start}`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await sleep(400);
      return html;
    } catch (e) {
      lastErr = e;
      await sleep(800 * (attempt + 1));
    }
  }
  console.warn(`  ⚠ artsro fetch 실패(스킵): CatNo=${catNo} start=${start} — ${lastErr?.message}`);
  return '';
}

// ── hooh fetch (crawl-hooh-keywords.mjs와 동일 로직) ────────────────────────
const HOOH_AJAX = 'https://www.hooh.kr/ajax/teacher_list.asp';
async function fetchHooh(page) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(HOOH_AJAX, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `page=${page}&sort=0`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await sleep(400);
      return html;
    } catch (e) {
      lastErr = e;
      await sleep(800 * (attempt + 1));
    }
  }
  console.warn(`  ⚠ hooh fetch 실패(스킵): page=${page} — ${lastErr?.message}`);
  return '';
}

async function exportArtsro(outDir) {
  console.log('\n=== artsro 전수 크롤링 ===');
  const seen = new Set();
  const rows = [];
  for (const catNo of ALL_CAT_NOS) {
    const people = await crawlCategory(catNo, fetchArtsro);
    const { category } = classify(catNo);
    let fresh = 0;
    for (const p of people) {
      if (seen.has(p.goIdx)) continue; // 여러 카테고리 중복 등장 방지
      seen.add(p.goIdx);
      rows.push({
        goIdx: p.goIdx,
        name: p.name,
        category,
        catNo,
        desc: p.desc,
        source: `https://www.artsro.com/right/enter_view.html?GoIdx=${p.goIdx}&CatNo=${catNo}`,
      });
      fresh++;
    }
    console.log(`  CatNo=${catNo} [${category}] ${people.length}건 (신규 ${fresh})`);
  }
  const csv = toCsv(['goIdx', 'name', 'category', 'catNo', 'desc', 'source'], rows);
  const path = join(outDir, 'artsro-list.csv');
  writeFileSync(path, csv);
  console.log(`✓ artsro: 총 ${rows.length}명 → ${path}`);
  return rows.length;
}

async function exportHooh(outDir) {
  console.log('\n=== hooh 전수 크롤링 ===');
  const people = await crawlAll(fetchHooh);
  const rows = people.map((p) => ({
    idx: p.idx,
    name: p.name,
    title: p.title,
    cate: p.cate,
    source: `https://www.hooh.kr/sub/teacher/next.asp?m_idx=${p.idx}`,
  }));
  const csv = toCsv(['idx', 'name', 'title', 'cate', 'source'], rows);
  const path = join(outDir, 'hooh-list.csv');
  writeFileSync(path, csv);
  console.log(`✓ hooh: 총 ${rows.length}명 → ${path}`);
  return rows.length;
}

async function main() {
  const which = process.argv[2];
  const outDir = join('output', 'crawl');
  mkdirSync(outDir, { recursive: true });

  if (!which || which === 'artsro') await exportArtsro(outDir);
  if (!which || which === 'hooh') await exportHooh(outDir);
}

main().catch((e) => { console.error(e); process.exit(1); });
