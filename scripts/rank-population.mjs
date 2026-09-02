#!/usr/bin/env node
// 1페이지에 오른 글 3만 건의 **분포**를 본다.
//
//   node scripts/rank-population.mjs
//
// 왜 분포인가 — 이 데이터로는 그 방법밖에 없다:
//   수집한 경쟁 글은 전부 상위 10위 안에 든 글이다. 못 뜬 경쟁 글은 기록이 없다.
//   그래서 "뜬 글 vs 못 뜬 글"을 이 데이터로는 만들 수 없다(rank-gate 가 우리 원고로
//   그 비교를 하는 이유다).
//
//   대신 **관문이 있다면 통과자 분포가 잘려 있어야 한다.** 인물명 18회가 관문이면
//   1페이지 글 중 18회를 넘는 글이 드물어야 한다. 흔하면 그 임계선은 틀린 것이다.
//   3만 건으로 할 수 있는 가장 강한 검증이고, 우리 원고 101편과 독립이다.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function page(t, c, mod = (q) => q) {
  let rows = [], from = 0;
  for (;;) {
    const { data, error } = await mod(db.from(t).select(c)).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows = rows.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}
const canonical = (u) => String(u).split('?')[0].replace(/\/$/, '');
const personOf = (q) => q.replace(/\s*섭외\s*$/, '').trim();

const docs = new Map(
  (await page('mih_serp_docs', 'url,title,body,char_len,is_ours'))
    .filter((d) => d.body).map((d) => [d.url, d])
);

// 문서 × 검색어 관측. 같은 문서가 여러 검색어에 뜨면 각각 센다(인물명이 다르므로).
const seen = new Set();
const pop = [];
for (const c of await page('mih_serp_checks', 'query,surface,competitors')) {
  if (c.surface !== 'pc-total') continue;
  const person = personOf(c.query);
  if (person.length < 2) continue;
  for (const k of c.competitors ?? []) {
    if (!k?.url || !k?.rank) continue;
    const u = canonical(k.url);
    const d = docs.get(u);
    if (!d) continue;
    const key = `${c.query}|${u}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pop.push({
      rank: k.rank, ours: d.is_ours,
      name: d.body.split(person).length - 1,
      len: d.char_len ?? d.body.length,
      title: (d.title ?? '').length,
      hasKw: (d.title ?? '').includes('섭외'),
    });
  }
}

// 검색어의 인물을 실제로 다루는 글만 남긴다. 1페이지에는 그 인물을 한 번도 언급하지
// 않는 글이 잔뜩 섞여 있다(포괄 홍보 글·엉뚱한 글). 우리 원고는 인물 전용이므로
// 그런 글과 길이·제목을 비교하면 기준이 통째로 왜곡된다.
const MIN_NAME = Number((process.argv.find((a) => a.startsWith('--min-name=')) ?? '--min-name=3').split('=')[1]);
const comp = pop.filter((p) => !p.ours && p.name >= MIN_NAME);
console.log(`
(인물을 ${MIN_NAME}회 이상 언급한 글만 — 전체 ${pop.filter((p) => !p.ours).length.toLocaleString()}건 중 ${comp.length.toLocaleString()}건)`);
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const share = (xs, f) => (xs.filter(f).length / xs.length * 100).toFixed(1);

console.log(`\n1페이지 글 분포 — 문서×검색어 ${comp.length.toLocaleString()}건 (우리 글 제외) · 통합검색`);
console.log(`(검색어 ${new Set(pop.map((p) => p.rank)).size ? new Set([...seen].map((k) => k.split('|')[0])).size.toLocaleString() : 0}개)\n`);

const dist = (label, key, edges, unit = '') => {
  console.log(label);
  for (let i = 0; i < edges.length; i++) {
    const lo = edges[i], hi = edges[i + 1] ?? Infinity;
    const g = comp.filter((p) => p[key] >= lo && p[key] < hi);
    const pctg = g.length / comp.length * 100;
    const bar = '█'.repeat(Math.round(pctg / 2));
    const top3 = g.length ? (g.filter((p) => p.rank <= 3).length / g.length * 100).toFixed(0) : '–';
    console.log(`  ${String(lo).padStart(6)}~${hi === Infinity ? '     ' : String(hi).padStart(6)}${unit}  ${pctg.toFixed(1).padStart(5)}%  ${String(g.length).padStart(6)}건  1~3위 비율 ${String(top3).padStart(3)}%  ${bar}`);
  }
  console.log(`  중앙값 ${pct(comp.map((p) => p[key]), 0.5)}${unit} · 90분위 ${pct(comp.map((p) => p[key]), 0.9)}${unit}\n`);
};

dist('인물명 반복 횟수', 'name', [0, 5, 10, 14, 18, 22, 26, 35, 50]);
dist('본문 길이', 'len', [0, 2000, 3000, 4000, 5000, 6000, 8000, 12000]);
dist('제목 길이', 'title', [0, 20, 30, 40, 45, 50, 55, 60, 70]);

console.log('임계선 검증 — 1페이지 글 가운데 우리 기준을 넘는 비율');
console.log(`  인물명 18회 이상 : ${share(comp, (p) => p.name >= 18)}%`);
console.log(`  인물명 22회 이상 : ${share(comp, (p) => p.name >= 22)}%`);
console.log(`  본문 6,000자 미만: ${share(comp, (p) => p.len < 6000)}%`);
console.log(`  제목 50자 미만   : ${share(comp, (p) => p.title < 50)}%`);
console.log(`  제목에 "섭외" 있음: ${share(comp, (p) => p.hasKw)}%`);

console.log('\n순위대별 중앙값 — 위로 갈수록 달라지는가');
console.log('  순위      건수    인물명   본문길이   제목길이');
for (const [lo, hi] of [[1, 3], [4, 6], [7, 10]]) {
  const g = comp.filter((p) => p.rank >= lo && p.rank <= hi);
  if (!g.length) continue;
  console.log(`  ${lo}~${hi}위  ${String(g.length).padStart(7)}건  ${String(pct(g.map((p) => p.name), 0.5)).padStart(5)}회  ${String(pct(g.map((p) => p.len), 0.5)).padStart(7)}자  ${String(pct(g.map((p) => p.title), 0.5)).padStart(6)}자`);
}
console.log('');
