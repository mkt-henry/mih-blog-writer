#!/usr/bin/env node
// 계정별 **잔존율** — "오늘 몇 개 떴나"가 아니라 "발행하고 N일 뒤에도 남아 있나".
//
//   npm run retention              # 통합검색 기준
//   npm run retention -- --surface=blog-tab
//   npm run retention -- --days=7  # 최근 7일 측정분만
//
// 왜 이 지표인가 (2026-08-30 실측, 설계문서 §7.14):
// 원고는 발행 직후 18.7% 가 노출되고 14일이 지나면 3.5%, 60일이면 0.5% 로 무너진다.
// 계정 차이도 **획득이 아니라 유지**에서 난다 — mih_agency 는 새 글이면 12.2% 로 붙는데
// 14일 넘은 301건이 전멸이다. 같은 모양으로 mih_speaker 가 먼저 저품질을 맞았다.
// 일일 노출률은 이걸 못 잡는다. 새 글이 계속 들어오면 숫자가 유지되는 것처럼 보인다.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const SURFACE = opt('surface', 'pc-total');
const WINDOW = Number(opt('days', 0));   // 0 = 전체 기간

async function page(table, cols, mod = (q) => q) {
  let rows = [], from = 0;
  for (;;) {
    const { data, error } = await mod(db.from(table).select(cols)).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows = rows.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

const blogOf = (u) => { const m = String(u ?? '').match(/blog\.naver\.com\/([^/]+)\//); return m ? m[1] : null; };

const arts = new Map((await page('articles', 'id,published_at,published_url'))
  .filter((a) => a.published_at && a.published_url)
  .map((a) => [a.id, a]));

const checks = (await page('mih_serp_checks', 'article_id,surface,checked_on,indexed',
  (q) => q.not('article_id', 'is', null).eq('surface', SURFACE)))
  .filter((c) => arts.has(c.article_id));

if (!checks.length) {
  console.log(`측정 데이터가 없다 (surface=${SURFACE}).`);
  process.exit(0);
}

const allDays = [...new Set(checks.map((c) => c.checked_on))].sort();
const cutoff = WINDOW ? allDays[Math.max(0, allDays.length - WINDOW)] : allDays[0];
const used = checks.filter((c) => c.checked_on >= cutoff);

// 측정 한 건 = "그 원고를 발행 N일째에 봤더니 있었다/없었다".
const ageOf = (c) => {
  const a = arts.get(c.article_id);
  return (new Date(c.checked_on + 'T00:00:00Z') - new Date(a.published_at)) / 86400000;
};

const BUCKETS = [[0, 7], [7, 14], [14, 30], [30, 45], [45, 9999]];
const label = ([lo, hi]) => (hi === 9999 ? `${lo}일+` : `${lo}~${hi}일`);

const tab = new Map();   // blog -> bucketKey -> {n, hit}
const bump = (blog, key, hit) => {
  const b = tab.get(blog) ?? new Map();
  const s = b.get(key) ?? { n: 0, hit: 0 };
  s.n++; if (hit) s.hit++;
  b.set(key, s); tab.set(blog, b);
};
for (const c of used) {
  const age = ageOf(c);
  if (age < 0) continue;
  const bk = BUCKETS.find(([lo, hi]) => age >= lo && age < hi);
  bump(blogOf(arts.get(c.article_id).published_url), label(bk), c.indexed === true);
  bump('__전체__', label(bk), c.indexed === true);
}

const pct = (s) => (s && s.n ? `${(100 * s.hit / s.n).toFixed(1)}%` : '—');
const cell = (s) => (s && s.n ? `${pct(s).padStart(6)}${`(${s.n})`.padStart(7)}` : '     —       ');

const span = `${cutoff} ~ ${allDays[allDays.length - 1]}`;
console.log(`\n잔존율 — ${SURFACE} · 측정 ${used.length}건 · 원고 ${new Set(used.map((c) => c.article_id)).size}건 · ${span}`);
console.log('(각 칸 = 그 나이대에 관찰했을 때 검색에 있던 비율, 괄호는 관찰 수)\n');

console.log('계정'.padEnd(16) + BUCKETS.map((b) => label(b).padStart(13)).join(''));
const blogs = [...tab.keys()].filter((b) => b !== '__전체__').sort();
for (const b of [...blogs, '__전체__']) {
  const row = tab.get(b);
  const name = b === '__전체__' ? '─ 전체' : b;
  console.log(name.padEnd(16) + BUCKETS.map((k) => cell(row.get(label(k)))).join(''));
}

// ── 진단 ──────────────────────────────────────────────────────────────────
// 죽어가는 계정은 두 단계로 간다: ① 오래된 글부터 빠진다 ② 새 글도 안 붙는다.
// ①만 보이면 아직 시간이 있고, ②까지 가면 mih_speaker 처럼 늦는다.
console.log('\n진단');
for (const b of blogs) {
  const row = tab.get(b);
  const fresh = row.get('0~7일'), old = [ [14,30], [30,45], [45,9999] ]
    .map((k) => row.get(label(k))).filter(Boolean)
    .reduce((a, s) => ({ n: a.n + s.n, hit: a.hit + s.hit }), { n: 0, hit: 0 });

  const f = fresh && fresh.n >= 10 ? 100 * fresh.hit / fresh.n : null;
  const o = old.n >= 10 ? 100 * old.hit / old.n : null;
  if (f === null && o === null) { console.log(`  ${b.padEnd(16)}관찰이 부족하다 (10건 미만)`); continue; }

  // 합쳐 보면 가려진다 — 14~30일이 멀쩡해도 30~45일이 0% 면 그 계정은 이미 무너지는 중이다.
  const wiped = [[30, 45], [45, 9999], [14, 30]]
    .map((k) => [label(k), row.get(label(k))])
    .find(([, s]) => s && s.n >= 20 && s.hit === 0);

  let verdict;
  if (f !== null && f < 3) verdict = '⛔ 새 글도 안 붙는다 — 이미 늦었다고 봐야 한다';
  else if (wiped) verdict = `⚠ ${wiped[0]} 글이 전멸(${wiped[1].n}건 관찰) — 저품질로 가는 모양`;
  else if (o !== null && o < 1) verdict = '⚠ 오래된 글이 거의 다 빠졌다';
  else if (o !== null && f !== null && o < f / 4) verdict = '⚠ 유지력이 떨어지고 있다';
  else verdict = '✅ 유지되고 있다';
  const fs = f === null ? '—' : `${f.toFixed(1)}%`;
  const os = o === null ? '—' : `${o.toFixed(1)}%`;
  console.log(`  ${b.padEnd(16)}새 글 ${fs.padStart(6)} · 14일+ ${os.padStart(6)}   ${verdict}`);
}

// ── 추세 ──────────────────────────────────────────────────────────────────
// 같은 나이대를 최근 주와 그 전 주로 나눠 본다. 떨어지고 있으면 지금 손대야 한다.
if (!WINDOW && allDays.length >= 10) {
  const mid = allDays[allDays.length - 7];
  const rate = (rows) => { const n = rows.length; return n ? 100 * rows.filter((c) => c.indexed === true).length / n : null; };
  console.log(`\n추세 — 14일 넘은 글의 잔존율 (${allDays[0]}~ vs ${mid}~)`);
  for (const b of blogs) {
    const mine = used.filter((c) => blogOf(arts.get(c.article_id).published_url) === b && ageOf(c) >= 14);
    const before = mine.filter((c) => c.checked_on < mid), after = mine.filter((c) => c.checked_on >= mid);
    if (before.length < 10 || after.length < 10) { console.log(`  ${b.padEnd(16)}관찰 부족`); continue; }
    const x = rate(before), y = rate(after), d = y - x;
    console.log(`  ${b.padEnd(16)}${x.toFixed(1)}% → ${y.toFixed(1)}%  (${d >= 0 ? '+' : ''}${d.toFixed(1)}%p)${d < -1 ? '  ← 떨어지는 중' : ''}`);
  }
}

console.log('\n측정은 매일 도는 노출 크론이 쌓는다. 기간이 길어질수록 오른쪽 칸이 채워진다.\n');
