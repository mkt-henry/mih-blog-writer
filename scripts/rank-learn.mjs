#!/usr/bin/env node
// "우리 순위 데이터로 학습하면 기성 점수보다 나아지는가"를 재는 실험.
//
//   node scripts/rank-learn.mjs
//
// 왜 필요한가: 기성 모델(임베딩·재순위)이 60%에서 멈춘다는 사실만으로는
// "우리 데이터로 튜닝해도 소용없다"가 되지 않는다. 기성 모델은 일반적인 "질문-문서 적합도"로
// 학습된 것이고, 네이버가 실제로 위에 올리는 기준은 그것과 다를 수 있다.
// **그 차이가 학습 가능한지**를 파이썬 환경 없이 먼저 확인한다.
//
// 방법: 이미 계산해 둔 점수들을 특징(feature)으로 놓고, 쌍 순서를 맞히도록
// 선형 모델을 학습한다(RankNet 의 선형판). 인코더 자체를 미세조정하는 것은 아니지만
// **"우리 라벨에 기성 점수가 못 잡는 구조가 있는가"** 에는 답할 수 있다.
//   - 학습이 최고 단일 점수를 크게 넘으면 → 라벨에 배울 게 있다. 미세조정 착수 근거.
//   - 거의 안 넘으면 → 이 특징들로는 짜낼 게 없다. 미세조정도 같은 벽을 만날 공산이 크다.
//
// 누수 방지: **쿼리 단위로** 교차검증한다. 같은 쿼리의 쌍이 학습·평가에 나뉘어 들어가면
// 성능이 부풀려진다(같은 문서가 양쪽에 등장한다).

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { cosine, chunk, openCache } from './lib/embed.mjs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };

async function page(table, cols) {
  let rows = [], from = 0;
  for (;;) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows = rows.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}
const canonical = (u) => String(u).split('?')[0].replace(/\/$/, '');
const personOf = (q) => q.replace(/\s*섭외\s*$/, '').trim();

const SURFACE = opt('surface', 'pc-total');
const MIN_AGREE = 0.7;
const EMB = openCache('./.models/cache-Xenova_bge-m3.json');
const RR = openCache('./.models/rr-Xenova_bge-reranker-base.json');

const docs = new Map(
  (await page('mih_serp_docs', 'url,blog_id,log_no,title,body,char_len'))
    .filter((d) => d.body).map((d) => [d.url, d])
);
const checks = (await page('mih_serp_checks', 'query,surface,competitors'))
  .filter((c) => c.surface === SURFACE && (c.competitors ?? []).length >= 2);

const tally = new Map();
for (const c of checks) {
  const list = (c.competitors ?? [])
    .filter((k) => k?.url && k?.rank && docs.has(canonical(k.url)))
    .map((k) => ({ url: canonical(k.url), rank: k.rank }));
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.rank === b.rank || a.url === b.url) continue;
      const [x, y] = a.url < b.url ? [a, b] : [b, a];
      const k = `${c.query} ${x.url} ${y.url}`;
      const t = tally.get(k) ?? { q: c.query, x: x.url, y: y.url, xWins: 0, n: 0 };
      if (x.rank < y.rank) t.xWins++;
      t.n++;
      tally.set(k, t);
    }
}

const pairs = [];
for (const t of tally.values()) {
  if (Math.max(t.xWins, t.n - t.xWins) / t.n < MIN_AGREE) continue;
  const hi = t.xWins * 2 >= t.n ? t.x : t.y, lo = hi === t.x ? t.y : t.x;
  const p = personOf(t.q);
  const dHi = docs.get(hi), dLo = docs.get(lo);
  if (!dHi.body.includes(p) || !dLo.body.includes(p)) continue;
  // 모델 점수를 쓰려면 문서 두 개와 **쿼리 두 종(원본·확장)** 이 전부 캐시에 있어야 한다.
  // 새로 수집한 검색어는 아직 임베딩 전이라 여기서 걸러진다.
  const emb = EMB.has(`c:${hi}`) && EMB.has(`c:${lo}`) && EMB.has(`q:${t.q}`) && EMB.has(`x:${t.q}`)
    && RR.has(`${t.q}|${hi}`) && RR.has(`${t.q}|${lo}`);
  pairs.push({ query: t.q, hi: dHi, lo: dLo, emb });
}

// ── 특징 ───────────────────────────────────────────────────────────────────
// 텍스트에서만 나오는 것과 계정에서 나오는 것을 갈라 둔다.
// 미세조정으로 배울 수 있는 것은 앞쪽뿐이다 — 모델은 본문만 보기 때문이다.
const count = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const top3 = (qv, url) => {
  const s = EMB.getMany(`c:${url}`).map((cv) => cosine(qv, cv)).sort((a, b) => b - a).slice(0, 3);
  return s.reduce((x, y) => x + y, 0) / s.length;
};
const docVecCache = new Map();
const docVec = (url) => {
  if (docVecCache.has(url)) return docVecCache.get(url);
  const cs = EMB.getMany(`c:${url}`);
  const m = new Array(cs[0].length).fill(0);
  for (const c of cs) for (let i = 0; i < m.length; i++) m[i] += c[i] / cs.length;
  const n = Math.hypot(...m);
  const v = m.map((x) => x / (n || 1));
  docVecCache.set(url, v);
  return v;
};
const rrOf = (q, url) => RR.getMany(`${q}|${url}`)?.[0] ?? null;

// 어휘 특징 — 언제나 계산할 수 있다.
const LEX_FEATURES = {
  '"섭외" 밀도': (q, d) => (count(d.body, '섭외') / Math.max(d.char_len, 1)) * 1000,
  '인물명 밀도': (q, d) => (count(d.body, personOf(q)) / Math.max(d.char_len, 1)) * 1000,
  '본문 길이': (q, d) => Math.log(Math.max(d.char_len, 1)),
  '제목에 섭외': (q, d) => ((d.title ?? '').includes('섭외') ? 1 : 0),
  '제목에 인물명': (q, d) => ((d.title ?? '').includes(personOf(q)) ? 1 : 0),
};

// 모델 점수 — 임베딩·재순위 캐시가 있는 쌍에서만 쓸 수 있다.
// 대량 수집 뒤에는 캐시가 일부에만 있으므로, 있는 쌍만 따로 모아 두 번 잰다.
const MODEL_FEATURES = {
  '임베딩 상위3': (q, d) => top3(EMB.get(`q:${q}`), d.url),
  '임베딩 확장쿼리': (q, d) => cosine(EMB.get(`x:${q}`), docVec(d.url)),
  '재순위 최고': (q, d) => { const s = rrOf(q, d.url); return s ? Math.max(...s) : 0; },
  '재순위 평균': (q, d) => { const s = rrOf(q, d.url); return s ? s.reduce((a, b) => a + b, 0) / s.length : 0; },
};

// 글의 나이. 네이버 logNo 는 발행 순서대로 커지므로 그 자체가 신선도 대리값이다
// (같은 자릿수 안에서만 비교 가능하니 자릿수와 값을 같이 넣는다).
// 본문 밖 요인이 얼마나 먹는지 보려는 것이지, 우리가 조작할 수 있는 값이 아니다.
const AGE_FEATURES = {
  '글 나이(logNo)': (q, d) => {
    const n = String(d.log_no ?? '');
    return n ? Number(n.length) * 1e3 + Number(n.slice(0, 4)) / 1e4 : 0;
  },
};

// 계정 특징은 별도. leave-one-out 으로 이 쌍의 기여를 빼고 계산한다.
const blogWin = new Map();
for (const p of pairs)
  for (const [b, won] of [[p.hi.blog_id, 1], [p.lo.blog_id, 0]]) {
    const s = blogWin.get(b) ?? { w: 0, n: 0 };
    s.w += won; s.n++; blogWin.set(b, s);
  }
const blogFeat = (d, won) => {
  const s = blogWin.get(d.blog_id);
  const n = s.n - 1;
  return n > 0 ? (s.w - won) / n : 0.5;
};

const AGE_NAMES = Object.keys(AGE_FEATURES);

// 한 번 돌려 두 벌을 잰다:
//   ① 전체 쌍 × 어휘 특징만          — 대량 수집 후의 주 표본
//   ② 임베딩 캐시가 있는 쌍 × 어휘+모델 — 의미 모델이 보태는 몫
// 5만 건을 전부 임베딩하려면 CPU 로 며칠이라, 캐시 없는 쌍을 버리면 표본이 통째로 날아간다.
function makeSet(feats) {
  const NAMES = Object.keys(feats);
  return {
    NAMES,
    feats,
    diff(p, extra) {
      const v = NAMES.map((n) => feats[n](p.query, p.hi) - feats[n](p.query, p.lo));
      if (extra === 'age' || extra === 'both')
        for (const n of AGE_NAMES) v.push(AGE_FEATURES[n](p.query, p.hi) - AGE_FEATURES[n](p.query, p.lo));
      if (extra === 'blog' || extra === 'both') v.push(blogFeat(p.hi, 1) - blogFeat(p.lo, 0));
      return v;
    },
  };
}
const LEX = makeSet(LEX_FEATURES);
const FULL = makeSet({ ...LEX_FEATURES, ...MODEL_FEATURES });

// ── 학습 (쌍 로지스틱 = 선형 RankNet) ──────────────────────────────────────
// 각 쌍을 (차이벡터, 1) 과 (−차이벡터, 0) 두 개로 넣는다. 대칭이라 절편이 필요 없다.
function train(X, y, { iters = 400, lr = 0.3, l2 = 1e-3 } = {}) {
  const d = X[0].length;
  const w = new Array(d).fill(0);
  for (let it = 0; it < iters; it++) {
    const g = new Array(d).fill(0);
    for (let i = 0; i < X.length; i++) {
      let z = 0;
      for (let j = 0; j < d; j++) z += w[j] * X[i][j];
      const e = 1 / (1 + Math.exp(-z)) - y[i];
      for (let j = 0; j < d; j++) g[j] += e * X[i][j];
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (g[j] / X.length + l2 * w[j]);
  }
  return w;
}

// 쿼리 단위 5겹 교차검증. 같은 쿼리가 학습·평가에 걸치면 성능이 부풀려진다.
function crossValidate(set, subset, extra, folds = 5) {
  const queries = [...new Set(subset.map((p) => p.query))].sort();
  const foldOf = new Map(queries.map((q, i) => [q, i % folds]));
  let correct = 0, total = 0;
  const weightSum = new Array(set.diff(subset[0], extra).length).fill(0);
  for (let f = 0; f < folds; f++) {
    const tr = subset.filter((p) => foldOf.get(p.query) !== f);
    const te = subset.filter((p) => foldOf.get(p.query) === f);
    if (!te.length || !tr.length) continue;
    const trV = tr.map((p) => set.diff(p, extra));
    // 표준화는 학습 폴드 통계로만 (평가 폴드를 보면 누수다)
    const d = trV[0].length;
    const sd = new Array(d).fill(0);
    for (let j = 0; j < d; j++) {
      const m = trV.reduce((s, v) => s + v[j], 0) / trV.length;
      sd[j] = Math.sqrt(trV.reduce((s, v) => s + (v[j] - m) ** 2, 0) / trV.length) || 1;
    }
    const norm = (v) => v.map((x, j) => x / sd[j]);
    const X = [], y = [];
    for (const v of trV) { const n = norm(v); X.push(n); y.push(1); X.push(n.map((x) => -x)); y.push(0); }
    const w = train(X, y);
    w.forEach((x, j) => { weightSum[j] += x / folds; });
    for (const p of te) {
      const v = norm(set.diff(p, extra));
      let z = 0;
      for (let j = 0; j < v.length; j++) z += w[j] * v[j];
      if (z > 0) correct++; else if (z === 0) correct += 0.5;
      total++;
    }
  }
  return { acc: correct / total, n: total, w: weightSum };
}

// 단일 점수 기준선 (학습 없이)
function single(fn, subset) {
  let c = 0;
  for (const p of subset) {
    const a = fn(p.query, p.hi), b = fn(p.query, p.lo);
    if (a > b) c++; else if (a === b) c += 0.5;
  }
  return c / subset.length;
}

console.log(`\n학습 실험 — ${SURFACE} · 쌍 ${pairs.length}개 · 쿼리 ${new Set(pairs.map((p) => p.query)).size}개`);
console.log('(쿼리 단위 5겹 교차검증 — 학습에 쓴 쿼리는 평가에서 제외)\n');

function report(label, set, subset) {
  if (subset.length < 100) { console.log(`  [${label}] 쌍 ${subset.length}개 — 너무 적어 생략\n`); return null; }
  const bests = set.NAMES.map((n) => ({ n, a: single(set.feats[n], subset) })).sort((x, y) => y.a - x.a);
  const text = crossValidate(set, subset, null);
  const age = crossValidate(set, subset, 'age');
  const all = crossValidate(set, subset, 'both');
  console.log(`  [${label}] 쌍 ${subset.length}개 · 쿼리 ${new Set(subset.map((p) => p.query)).size}개 · 오차 ±${(100 / Math.sqrt(subset.length)).toFixed(1)}%p`);
  console.log(`    최고 단일 점수 (학습 없음)  ${(bests[0].a * 100).toFixed(1)}%   ← ${bests[0].n}`);
  console.log(`    본문 특징 ${set.NAMES.length}개 학습       ${(text.acc * 100).toFixed(1)}%`);
  console.log(`    + 글 나이까지             ${(age.acc * 100).toFixed(1)}%`);
  console.log(`    + 계정까지               ${(all.acc * 100).toFixed(1)}%`);
  const d = (text.acc - bests[0].a) * 100;
  console.log(`    본문 학습 − 최고 단일:    ${d >= 0 ? '+' : ''}${d.toFixed(1)}%p  ${d > 2 ? '← 라벨에 배울 게 있다 (미세조정 착수 신호)' : '← 이 특징들로는 짜낼 게 없다'}\n`);
  return { bests, text, all };
}

const embPairs = pairs.filter((p) => p.emb);
const lexResult = report('전체 · 어휘 특징만', LEX, pairs);
const fullResult = report('임베딩 확보분 · 어휘+모델', FULL, embPairs);
const all = fullResult?.all ?? lexResult?.all;

// ── 라벨 잡음 천장 ─────────────────────────────────────────────────────────
// 네이버 순위 자체가 날마다 흔들리면, 어떤 모델도 그 흔들림 위로는 못 간다.
// 3회 이상 관측된 쌍에서 "언제나 같은 순서"인 비율이 곧 달성 가능한 상한이다.
const repeated = [...tally.values()].filter((t) => t.n >= 3);
const stable = repeated.filter((t) => t.xWins === 0 || t.xWins === t.n).length;
const agreeAvg = repeated.reduce((s, t) => s + Math.max(t.xWins, t.n - t.xWins) / t.n, 0) / (repeated.length || 1);
console.log(`  라벨 안정성 — 3회 이상 관측된 쌍 ${repeated.length}개 중 순서가 한 번도 안 뒤집힌 것 ${stable}개 (${(100 * stable / (repeated.length || 1)).toFixed(0)}%)`);
console.log(`  평균 일치율 ${(agreeAvg * 100).toFixed(1)}% — 어떤 모델도 이 위로는 못 간다(순위 자체가 흔들리는 몫).\n`);

if (all) console.log('  학습된 가중치 (표준화 기준, 절댓값 큰 순):');
const wn = [...(fullResult ? FULL.NAMES : LEX.NAMES), ...AGE_NAMES, '계정 승률'];
if (all) all.w.map((x, j) => ({ n: wn[j] ?? `f${j}`, x })).sort((a, b) => Math.abs(b.x) - Math.abs(a.x))
  .forEach((r) => console.log(`    ${r.n.padEnd(16)}${r.x >= 0 ? '+' : ''}${r.x.toFixed(3)}`));
console.log('');
