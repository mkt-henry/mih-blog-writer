#!/usr/bin/env node
// 노출 관문 점수 모델 — "이 원고가 통합검색 1페이지에 뜰 확률"을 매긴다.
//
//   node scripts/gate-model.mjs                       학습 + 교차검증 보고
//   node scripts/gate-model.mjs --no-embed            임베딩 없이(모델 로드 없음, 수 초)
//   node scripts/gate-model.mjs --score=<html> --person=<인물명> [--agency=mih_casting] [--title=...]
//   옵션: --surface=pc-total --min-obs=3 --repeats=10 --pca=8 --l2=1
//
// 무엇을 배우나: 우리 발행 원고의 노출 기록(mih_serp_checks, **실패 포함**)으로 뜬 글과
// 못 뜬 글을 가르는 로지스틱 회귀. 특징은 rank-gate 와 같은 수작업 지표 + bge-m3 임베딩
// (쿼리 유사도 · 뜬 글/못 뜬 글 중심 유사도 · 주성분 k개).
//
// 왜 3만 건 경쟁 글로 학습하지 않나: 그 표본엔 실패가 없다. 전부 1페이지에 오른 글이라
// "뜨는 글 vs 못 뜨는 글"의 경계를 거기서 배울 수 없다(생존자만 있는 표본으로 관문을 배우면
// "네이버 블로그 글처럼 생겼는가"를 배우게 된다). 실패가 기록된 표본은 우리 원고뿐이다 —
// rank-gate 가 우리 원고만 쓰는 것과 같은 이유다.
//
// 정직한 자:
//   - 검색어 단위 K겹 교차검증. 같은 인물의 원고가 학습·평가에 나뉘면 점수가 부푼다.
//   - 지도 파생 특징(뜬 글/못 뜬 글 중심)은 학습 겹 안에서만 만든다.
//   - 기준선은 "인물명 횟수" 하나. 모델이 이걸 2%p 이상 못 넘으면 임베딩은 도움이 안 된 것.
//   - 노출이 0편인 계정은 뺀다. 계정이 죽은 것이라 원고에 대해 아무것도 가르쳐 주지 않는다.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FEATURES, strip } from './lib/gate-features.mjs';
import { embed, chunk, cosine, openCache } from './lib/embed.mjs';
import { searchName } from '../lib/name-match.mjs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };

const SURFACE = opt('surface', 'pc-total');
const MIN_OBS = Number(opt('min-obs', 3));
const REPEATS = Number(opt('repeats', 10));
const FOLDS = 5;
const PCA_K = Number(opt('pca', 8));
// 표본 백 단위 · 특징 스물 남짓이라 규제를 세게 건다. 1→10 에서 임베딩 모델이 66→70% 로 올랐고
// 10→30 은 오차 안(2026-09-05 실측). 가장 좋은 값을 고르지 않고 가운데를 쓴다.
const L2 = Number(opt('l2', 10));
const NO_EMBED = args.includes('--no-embed');
const SCORE = opt('score', null);
const MODEL = 'Xenova/bge-m3';
const CHUNKS = 12;                       // 500자 × 12 = 6,000자. 우리 원고 대부분이 이 안에 든다.
const DAY0 = Date.parse('2026-01-01');

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

// ── 표본: 우리 발행 원고 + 노출 기록 ───────────────────────────────────────
const arts = (await page('articles', 'id,agency,person_name,title,published_at,html_content'))
  .filter((a) => a.published_at && a.html_content);
const obs = new Map();
for (const c of await page('mih_serp_checks', 'article_id,indexed,surface,query', (q) => q.not('article_id', 'is', null))) {
  if (c.surface !== SURFACE) continue;
  const o = obs.get(c.article_id) ?? { n: 0, idx: 0, query: c.query };
  o.n++; if (c.indexed) o.idx++;
  obs.set(c.article_id, o);
}
let docs = [];
for (const a of arts) {
  const o = obs.get(a.id);
  if (!o || o.n < MIN_OBS) continue;
  const body = strip(a.html_content);
  if (body.length < 200) continue;
  docs.push({
    id: a.id, agency: a.agency, person_name: a.person_name, title: a.title, body, len: body.length,
    t: (Date.parse(a.published_at) - DAY0) / 86400000, query: o.query,
    rate: o.idx / o.n, y: o.idx / o.n >= 0.5 ? 1 : 0,
  });
}
const byAg = new Map();
for (const d of docs) { const s = byAg.get(d.agency) ?? { n: 0, pos: 0 }; s.n++; s.pos += d.y; byAg.set(d.agency, s); }
const dead = [...byAg].filter(([, s]) => s.pos === 0).map(([k]) => k);
docs = docs.filter((d) => !dead.includes(d.agency));
const AGENCIES = [...new Set(docs.map((d) => d.agency))].sort();
const y = docs.map((d) => d.y);
const nPos = y.reduce((a, b) => a + b, 0);
console.log(`노출 관문 모델 — ${SURFACE} · 원고 ${docs.length}편 (뜬 글 ${nPos} · 못 뜬 글 ${docs.length - nPos}) · 관측 ${MIN_OBS}일 이상`);
console.log(`  계정별: ${[...byAg].map(([k, s]) => `${k} ${s.pos}/${s.n}`).join(' · ')}`);
if (dead.length) console.log(`  제외: ${dead.join(', ')} — 노출 0편. 계정이 죽은 것이라 원고 차이를 배울 수 없다.`);
if (docs.length < 40 || nPos < 10) { console.log('표본이 너무 적다 — --min-obs 를 낮추거나 기다려라.'); process.exit(0); }

// ── 임베딩 ─────────────────────────────────────────────────────────────────
const cache = NO_EMBED ? null : openCache(`./.models/cache-${MODEL.replace(/[^\w.-]/g, '_')}.json`);
const meanVec = (rows) => {
  const m = new Array(rows[0].length).fill(0);
  for (const r of rows) for (let i = 0; i < m.length; i++) m[i] += r[i] / rows.length;
  const n = Math.hypot(...m) || 1;
  return m.map((x) => x / n);
};
async function attachVectors(list) {
  const missQ = [...new Set(list.map((d) => d.query))].filter((q) => !cache.has(`q:${q}`));
  if (missQ.length) {
    const v = await embed(MODEL, missQ, { kind: 'query' });
    missQ.forEach((q, i) => cache.set(`q:${q}`, v[i]));
    cache.save();
  }
  const miss = list.filter((d) => !cache.has(`a:${d.id}`));
  if (miss.length) console.log(`[embed] 원고 ${miss.length}편 새로 계산 (캐시 ${cache.size()}건)`);
  const t0 = Date.now();
  for (let i = 0; i < miss.length; i++) {
    cache.set(`a:${miss[i].id}`, await embed(MODEL, chunk(miss[i].body).slice(0, CHUNKS)));
    if ((i + 1) % 10 === 0 || i === miss.length - 1) {
      cache.save();
      const per = (Date.now() - t0) / (i + 1);
      console.log(`  ${i + 1}/${miss.length} — 남은 시간 약 ${Math.round((miss.length - i - 1) * per / 60000)}분`);
    }
  }
  for (const d of list) { d.vec = meanVec(cache.getMany(`a:${d.id}`)); d.qvec = cache.get(`q:${d.query}`); }
}
if (!NO_EMBED) await attachVectors(docs);

// ── 수학 ───────────────────────────────────────────────────────────────────
function solve(A, b) {                       // 가우스 소거, 부분 피벗
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
// 로지스틱 회귀(L2, 절편 무벌점). 뉴턴 반복 — 특징이 수십 개라 이걸로 충분하다.
function fitLogit(X, yy, l2) {
  const n = X.length, p = X[0].length + 1;
  const Z = X.map((r) => [1, ...r]);
  let w = new Array(p).fill(0);
  for (let it = 0; it < 30; it++) {
    const pr = Z.map((r) => sigmoid(r.reduce((s, v, j) => s + v * w[j], 0)));
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    const g = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const wi = pr[i] * (1 - pr[i]), ri = yy[i] - pr[i];
      for (let a = 0; a < p; a++) {
        g[a] += Z[i][a] * ri;
        for (let b = a; b < p; b++) H[a][b] += wi * Z[i][a] * Z[i][b];
      }
    }
    for (let a = 1; a < p; a++) { H[a][a] += l2; g[a] -= l2 * w[a]; }
    for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
    const step = solve(H, g);
    w = w.map((v, j) => v + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-6) break;
  }
  return w;
}
const predict = (w, X) => X.map((r) => sigmoid(w[0] + r.reduce((s, v, j) => s + v * w[j + 1], 0)));
// AUC — 뜬 글 하나·못 뜬 글 하나를 무작위로 뽑았을 때 뜬 글 점수가 더 높을 확률
function auc(s, yy) {
  let win = 0, n = 0;
  for (let i = 0; i < s.length; i++) if (yy[i])
    for (let j = 0; j < s.length; j++) if (!yy[j]) { n++; win += s[i] > s[j] ? 1 : s[i] === s[j] ? 0.5 : 0; }
  return n ? win / n : 0.5;
}
// 주성분 — 거듭제곱 반복. 비지도라 전체 원고로 한 번만 맞춘다(라벨 누수 없음).
function pca(rows, k) {
  const d = rows[0].length, mu = new Array(d).fill(0);
  for (const r of rows) for (let i = 0; i < d; i++) mu[i] += r[i] / rows.length;
  let X = rows.map((r) => r.map((v, i) => v - mu[i]));
  const comps = [];
  for (let c = 0; c < k; c++) {
    let v = Array.from({ length: d }, (_, i) => Math.sin(i * 12.9898 + c * 78.233));   // 고정 시작점 — 실행마다 같다
    for (let it = 0; it < 60; it++) {
      const u = X.map((r) => r.reduce((s, x, i) => s + x * v[i], 0));
      const nv = new Array(d).fill(0);
      for (let i = 0; i < X.length; i++) for (let j = 0; j < d; j++) nv[j] += X[i][j] * u[i];
      const nrm = Math.hypot(...nv) || 1;
      v = nv.map((x) => x / nrm);
    }
    comps.push(v);
    const proj = X.map((r) => r.reduce((s, x, i) => s + x * v[i], 0));
    X = X.map((r, i) => r.map((x, j) => x - proj[i] * v[j]));
  }
  return { mu, comps };
}
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (a, rand) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ── 특징 ───────────────────────────────────────────────────────────────────
const PCA = NO_EMBED ? null : pca(docs.map((d) => d.vec), PCA_K);
// set: 'hand' 수작업만 · 'emb' 임베딩만 · 'both' 둘 다. 통제(발행 시점·계정)는 언제나 들어간다.
function featurize(train, test, set) {
  const names = [], cols = [];
  if (set === 'hand' || set === 'both') for (const [n, f] of Object.entries(FEATURES)) { names.push(n); cols.push(f); }
  if (set === 'name') { names.push('인물명 횟수'); cols.push(FEATURES['인물명 횟수']); }
  // 발행 시점은 넣지 않는다 — 원 AUC 50.6%(2026-09-05 실측), 정보가 없는 특징은 아래 바닥선을 끌어내리기만 한다.
  if (set !== 'name') for (const a of AGENCIES) { names.push(`계정 ${a}`); cols.push((d) => (d.agency == null ? NaN : d.agency === a ? 1 : 0)); }
  if (set === 'emb' || set === 'both') {
    // 중심 벡터는 학습 표본으로만 만든다. 학습 원고 자신은 자기 중심에서 뺀다(leave-one-out) —
    // 안 빼면 자기 벡터가 든 중심과의 유사도가 되어 계수가 부풀고(실측 +3.8), 새 원고 점수가 그 계수에 끌려간다.
    const sum = (list) => { const s = new Array(list[0]?.vec.length ?? 0).fill(0); for (const d of list) for (let i = 0; i < s.length; i++) s[i] += d.vec[i]; return s; };
    const pos = train.filter((d) => d.y), neg = train.filter((d) => !d.y);
    const sPos = sum(pos), sNeg = sum(neg), inTrain = new Set(train);
    const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
    const centroid = (s, list, d) => unit(inTrain.has(d) && list.includes(d) ? s.map((x, i) => x - d.vec[i]) : s);
    names.push('쿼리 유사도'); cols.push((d) => cosine(d.vec, d.qvec));
    names.push('뜬 글 중심 − 못 뜬 글 중심');
    cols.push((d) => cosine(d.vec, centroid(sPos, pos, d)) - cosine(d.vec, centroid(sNeg, neg, d)));
    for (let k = 0; k < PCA_K; k++) {
      const c = PCA.comps[k];
      names.push(`임베딩 주성분 ${k + 1}`);
      cols.push((d) => d.vec.reduce((s, v, i) => s + (v - PCA.mu[i]) * c[i], 0));
    }
  }
  const raw = (list) => list.map((d) => cols.map((f) => f(d)));
  const Rtr = raw(train), Rte = raw(test);
  // 표준화 — 학습 표본의 평균·표준편차로. 변량이 0인 특징은 뺀다. NaN(계정 미지정)은 평균으로.
  const mu = names.map((_, j) => Rtr.reduce((s, r) => s + r[j], 0) / Rtr.length);
  const sd = names.map((_, j) => Math.sqrt(Rtr.reduce((s, r) => s + (r[j] - mu[j]) ** 2, 0) / Rtr.length));
  const kept = names.map((_, j) => j).filter((j) => sd[j] > 1e-9);
  const z = (r) => kept.map((j) => (Number.isNaN(r[j]) ? 0 : (r[j] - mu[j]) / sd[j]));
  return {
    names: kept.map((j) => names[j]),
    Xtr: Rtr.map(z), Xte: Rte.map(z),
    rawTr: Rtr.map((r) => kept.map((j) => r[j])), rawTe: Rte.map((r) => kept.map((j) => r[j])),
  };
}

// ── 교차검증 ───────────────────────────────────────────────────────────────
// '계정만' 은 정보 없는 특징만 학습한 바닥선이다. 표본이 백 단위면 정보 없는 특징을 학습한 모델의
// 교차검증 AUC 는 50%가 아니라 그 아래로 내려간다(학습 겹의 우연한 치우침이 평가 겹에서 반대로 서기
// 때문 — 실측 35~40%). 그래서 학습 모델은 50%가 아니라 이 바닥선과 비교해야 공정하다.
// '인물명 횟수(학습)' 은 기준선과 같은 특징 하나를 같은 방식으로 학습한 것 — 학습 방식 자체의 손실을 보여준다.
const SETS = NO_EMBED
  ? { '계정만(정보 없음 바닥선)': 'ctrl', '인물명 횟수(학습)': 'name', '수작업 특징': 'hand' }
  : { '계정만(정보 없음 바닥선)': 'ctrl', '인물명 횟수(학습)': 'name', '수작업 특징': 'hand', '수작업 + 임베딩': 'both', '임베딩만': 'emb' };
const groups = [...new Set(docs.map((d) => d.query))];
const aucs = {}, oof = {};
const hasPos = new Set(docs.filter((d) => d.y).map((d) => d.query));
for (let r = 0; r < REPEATS; r++) {
  // 겹마다 뜬 글 비율을 맞춘다(층화). 안 맞추면 신호가 없는 특징도 AUC 가 50% 아래로 쏠린다 —
  // 뜬 글이 많은 겹은 뜬 글이 적은 학습 표본으로 예측되어 점수가 낮게 나오고, 합쳐서 재면
  // 그 겹 전체가 거꾸로 서열이 매겨진다(표본 백 단위에서 30%까지 떨어지는 걸 실측했다).
  const gs = shuffle([...groups], rng(r + 1));
  const fold = new Map();
  gs.filter((q) => hasPos.has(q)).forEach((q, i) => fold.set(q, i % FOLDS));
  gs.filter((q) => !hasPos.has(q)).forEach((q, i) => fold.set(q, i % FOLDS));
  for (const [name, set] of Object.entries(SETS)) {
    const pred = new Array(docs.length).fill(0.5);
    for (let f = 0; f < FOLDS; f++) {
      const tr = [], te = [];
      docs.forEach((d, i) => (fold.get(d.query) === f ? te : tr).push(i));
      if (!te.length) continue;
      const F = featurize(tr.map((i) => docs[i]), te.map((i) => docs[i]), set);
      const w = fitLogit(F.Xtr, tr.map((i) => y[i]), L2);
      predict(w, F.Xte).forEach((p, k) => { pred[te[k]] = p; });
    }
    (aucs[name] ??= []).push(auc(pred, y));
    if (r === 0) oof[name] = pred;
  }
}
function bootAuc(s, iters = 300) {
  const rand = rng(99), out = [];
  for (let it = 0; it < iters; it++) {
    const idx = Array.from({ length: s.length }, () => Math.floor(rand() * s.length));
    out.push(auc(idx.map((i) => s[i]), idx.map((i) => y[i])));
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]];
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const mean = (a) => a.reduce((x, v) => x + v, 0) / a.length;
const sdev = (a) => Math.sqrt(a.reduce((x, v) => x + (v - mean(a)) ** 2, 0) / a.length);
const row = (name, a, ci, s) =>
  console.log(`  ${name.padEnd(26)}${pct(a).padStart(6)}   [${pct(ci[0])}, ${pct(ci[1])}]${s == null ? '' : `   ±${pct(s)}`}`);

console.log(`\n${FOLDS}겹 교차검증 × ${REPEATS}회 — 검색어 단위로 나눔(같은 인물의 원고가 학습·평가에 갈라지지 않게)`);
console.log('  모델'.padEnd(28) + 'AUC     95% 구간(원고 재표집)   반복 편차');
const base = docs.map((d) => -FEATURES['인물명 횟수'](d));
row('인물명 횟수 단독(기준선)', auc(base, y), bootAuc(base), null);
for (const name of Object.keys(SETS)) row(name, mean(aucs[name]), bootAuc(oof[name]), sdev(aucs[name]));
console.log('\n  읽는 법: AUC = 뜬 글 하나와 못 뜬 글 하나를 무작위로 골랐을 때 모델이 뜬 글에 더 높은 점수를 줄 확률.');
console.log('  50%가 동전. 구간이 50%를 물면 판별 못 하는 것. 기준선을 2%p 이상 못 넘으면 그 모델은 인물명 횟수 하나보다 나은 게 없다.');

// ── 최종 모델(전체 원고) ────────────────────────────────────────────────────
const FINAL = NO_EMBED ? 'hand' : 'both';
const Fall = featurize(docs, docs, FINAL);
const wAll = fitLogit(Fall.Xtr, y, L2);
console.log(`\n최종 모델(${Object.keys(SETS).find((k) => SETS[k] === FINAL)}) 계수 — 표준화 기준, |계수| 순. 양수 = 클수록 뜬다`);
Fall.names.map((n, j) => [n, wAll[j + 1]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12)
  .forEach(([n, w]) => console.log(`  ${n.padEnd(28)}${w >= 0 ? '+' : ''}${w.toFixed(2)}`));

// ── 원고 하나 점수 ─────────────────────────────────────────────────────────
if (SCORE) {
  const person = opt('person', null);
  if (!person) { console.error('\n--person=<인물명> 이 필요하다 (인물명 반복을 세는 기준).'); process.exit(1); }
  const html = readFileSync(SCORE, 'utf8');
  const body = strip(html);
  const d = {
    id: `file:${createHash('md5').update(body).digest('hex')}`,   // 내용이 바뀌면 다시 계산되게
    agency: opt('agency', null), person_name: person,
    // 원고 HTML 에는 <title> 이 없다 — 제목은 파일명 `<slug>_<제목>.html` 에 들어 있다.
    title: opt('title', null)
      ?? html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim()
      ?? SCORE.replace(/^.*[\\/]/, '').replace(/\.html?$/i, '').replace(/^[^_]*_/, ''),
    body, len: body.length, t: (Date.now() - DAY0) / 86400000, query: `${searchName(person)} 섭외`,
  };
  if (!NO_EMBED) await attachVectors([d]);
  const F = featurize(docs, [d], FINAL);
  const p = predict(wAll, F.Xte)[0];
  console.log(`\n${SCORE}\n  노출 확률 ${(p * 100).toFixed(0)}%   (학습 표본의 뜬 글 비율 ${(nPos / docs.length * 100).toFixed(0)}% — 이보다 높으면 평균 이상)`);
  const med = (vals) => { const s = [...vals].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const fmt = (v) => (Number.isNaN(v) ? '-' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  console.log('  무엇이 점수를 움직였나 (표준화 값 × 계수, |값| 순):');
  console.log('    ' + '특징'.padEnd(28) + '기여     이 원고    뜬 글 중앙값   못 뜬 글 중앙값');
  F.names.map((n, j) => ({
    n, c: F.Xte[0][j] * wAll[j + 1], v: F.rawTe[0][j],
    hi: med(docs.map((_, i) => F.rawTr[i][j]).filter((_, i) => y[i])),
    lo: med(docs.map((_, i) => F.rawTr[i][j]).filter((_, i) => !y[i])),
  })).sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 8)
    .forEach((x) => console.log(`    ${x.n.padEnd(28)}${(x.c >= 0 ? '+' : '') + x.c.toFixed(2).padStart(5)}   ${fmt(x.v).padStart(8)}   ${fmt(x.hi).padStart(10)}   ${fmt(x.lo).padStart(12)}`));
}
process.exit(0);
