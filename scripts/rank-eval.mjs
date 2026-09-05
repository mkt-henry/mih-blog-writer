#!/usr/bin/env node
// 네이버 실제 순위를 얼마나 재현하는지 재는 자.
//
//   node scripts/rank-eval.mjs
//   node scripts/rank-eval.mjs --surface=blog-tab --min-agree=0.7
//   node scripts/rank-eval.mjs --model=Xenova/bge-m3      # 임베딩 지표까지 함께 잰다
//   node scripts/rank-eval.mjs --reranker=Xenova/bge-reranker-base   # 재순위 모델
//
// **후보 지표·모델은 전부 이 자를 통과해야 한다.** 2026-08-15 에 유사도 지표를
// 만들자마자 그것으로 원고를 두 번 고쳤는데, 나중에 재보니 재현율 43.3%(동전 이하)였다.
// 그 사고를 막으려고 자를 먼저 고정한다.
//
// 재는 방법: 같은 쿼리 안에서 네이버가 A를 B보다 위에 뒀을 때, 지표도 A에 더 높은 값을
// 주는가를 센다. **50% = 동전 던지기.**
//
// 잡음 제거 세 가지 — 이걸 안 하면 롱테일 쿼리가 결과를 지배한다
// (실측: `시옷시옷 섭외` 1위가 "성복동맛집", `백은하 섭외` 1위가 "좋은 동료와의 대화"):
//   1) 여러 날 관측에서 순서가 뒤집히는 쌍은 버린다 (--min-agree)
//   2) 두 문서 모두 인물명을 본문에 담고 있어야 한다 — 무관한 글과의 비교는 검색 경쟁이 아니다
//   3) 본문을 못 받은 문서는 뺀다 (`node scripts/serp-corpus.mjs` 로 채운다)

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { embed, cosine, chunk, openCache, rerank } from './lib/embed.mjs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const opt = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};

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
// 쿼리 `<인물명> 섭외` 에서 인물명만
const personOf = (q) => q.replace(/\s*섭외\s*$/, '').trim();

const SURFACE = opt('surface', 'pc-total');
const MIN_AGREE = Number(opt('min-agree', 0.7));

const docs = new Map(
  (await page('mih_serp_docs', 'url,blog_id,log_no,title,body,char_len,is_ours,struct'))
    .filter((d) => d.body)
    // {unavailable:true} 는 "재수집 불가" 표식이지 실제 구성 0건이 아니다 — 구성 특징에서 뺀다.
    .map((d) => (d.struct?.unavailable ? { ...d, struct: null } : d))
    .map((d) => [d.url, d])
);
const checks = (await page('mih_serp_checks', 'query,checked_on,surface,competitors'))
  .filter((c) => c.surface === SURFACE && (c.competitors ?? []).length >= 2);

// 쌍 만들기 — key 는 방향을 고정해 여러 날 관측을 같은 칸에 모은다.
const tally = new Map();
for (const c of checks) {
  const list = (c.competitors ?? [])
    .filter((k) => k?.url && k?.rank && docs.has(canonical(k.url)))
    .map((k) => ({ url: canonical(k.url), rank: k.rank }));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.rank === b.rank || a.url === b.url) continue;
      const [x, y] = a.url < b.url ? [a, b] : [b, a];
      const k = `${c.query} ${x.url} ${y.url}`;
      const t = tally.get(k) ?? { q: c.query, x: x.url, y: y.url, xWins: 0, n: 0 };
      if (x.rank < y.rank) t.xWins++;   // rank 가 작을수록 위
      t.n++;
      tally.set(k, t);
    }
  }
}

const pairs = [];
let dropUnstable = 0, dropOfftopic = 0;
for (const t of tally.values()) {
  const agree = Math.max(t.xWins, t.n - t.xWins) / t.n;
  if (agree < MIN_AGREE) { dropUnstable++; continue; }
  const hi = t.xWins * 2 >= t.n ? t.x : t.y;
  const lo = hi === t.x ? t.y : t.x;
  const person = personOf(t.q);
  const dHi = docs.get(hi), dLo = docs.get(lo);
  if (!dHi.body.includes(person) || !dLo.body.includes(person)) { dropOfftopic++; continue; }
  pairs.push({ query: t.q, person, hi: dHi, lo: dLo, obs: t.n });
}

if (pairs.length === 0) {
  console.log('비교할 쌍이 없다. 먼저 `node scripts/serp-corpus.mjs` 로 본문을 받아라.');
  process.exit(0);
}

// 후보 지표. 새 모델은 여기에 한 줄 추가하고 아래 표에서 비교한다.
const count = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const SCORERS = {
  '최신성(log_no)': (q, d) => Number(d.log_no),
  '본문 길이': (q, d) => d.char_len,
  '"섭외" 횟수': (q, d) => count(d.body, '섭외'),
  '"섭외" 밀도': (q, d) => (count(d.body, '섭외') / Math.max(d.char_len, 1)) * 1000,
  '인물명 횟수': (q, d) => count(d.body, personOf(q)),
  '인물명 밀도': (q, d) => (count(d.body, personOf(q)) / Math.max(d.char_len, 1)) * 1000,
  '제목에 "섭외"': (q, d) => ((d.title ?? '').includes('섭외') ? 1 : 0),
  '제목에 인물명': (q, d) => ((d.title ?? '').includes(personOf(q)) ? 1 : 0),
  '제목 길이': (q, d) => (d.title ?? '').length,
  '제목에 숫자 없음': (q, d) => (/\d/.test(d.title ?? '') ? 0 : 1),
  // ── 내용 충실도 후보 (본문 텍스트만으로 잴 수 있는 것) ────────────────
  // "원고 품질은 무관"이 정말인지 보려고 넣는다. 지금까지의 지표는 전부
  // 길이·키워드 횟수라 품질을 잰 적이 없다.
  '어휘 다양성': (q, d) => {
    const t = d.body.split(/\s+/).filter(Boolean);
    return t.length ? new Set(t).size / t.length : 0;
  },
  '문장 수': (q, d) => (d.body.match(/[.!?]|다\s|요\s/g) ?? []).length,
  '평균 문장 길이': (q, d) => {
    const n = (d.body.match(/[.!?]|다\s|요\s/g) ?? []).length;
    return n ? d.char_len / n : d.char_len;
  },
  '숫자 밀도': (q, d) => ((d.body.match(/\d/g) ?? []).length / Math.max(d.char_len, 1)) * 1000,
  '실무정보어': (q, d) => ['비용', '견적', '문의', '일정', '출연료', '섭외료', '예산', '계약', '진행 절차', '섭외 문의']
    .reduce((a, w) => a + count(d.body, w), 0),
  '고유명사 다양성': (q, d) => new Set((d.body.match(/[가-힣]{2,}/g) ?? [])).size,

  // ── 구성 지표 (`--struct` 보충분이 있어야 잰다) ──────────────────────────
  // 이미지·영상·표는 "원고 품질"에서 사람이 실제로 보는 부분이다. 지금까지는
  // 코퍼스가 텍스트만 담고 있어 아예 잴 수가 없었다. 구성이 없는 문서는 NaN 이
  // 되어 자동으로 빠지므로, 보충이 절반만 끝난 상태에서 돌려도 결과는 정직하다.
  '이미지 수': (q, d) => d.struct?.img ?? NaN,
  '이미지 밀도': (q, d) => (d.struct ? (d.struct.img / Math.max(d.char_len, 1)) * 1000 : NaN),
  '영상 있음': (q, d) => (d.struct ? (d.struct.video > 0 ? 1 : 0) : NaN),
  '표 수': (q, d) => d.struct?.table ?? NaN,
  '소제목 수': (q, d) => d.struct?.heading ?? NaN,
  '인용구 수': (q, d) => d.struct?.quote ?? NaN,
  '외부링크 수': (q, d) => d.struct?.link ?? NaN,
  '문단 수': (q, d) => d.struct?.para ?? NaN,
  '문단당 글자수': (q, d) => (d.struct?.para ? d.char_len / d.struct.para : NaN),
};

// ── 임베딩 지표 (선택) ─────────────────────────────────────────────────────
// 조각 벡터만 계산하고, 문서 벡터는 조각 평균으로 만든다.
//
// 왜 전문을 통째로 안 넣나 (2026-08-22 실측): 8,000자 한 건에 **33.6초** 든다
// (어텐션이 길이의 제곱이라 CPU에서 감당이 안 된다). 1,158건이면 11시간이다.
// 같은 모델로 500자 조각 8개는 1.0초다. 문서당 40배 차이다.
//
// 속도만의 문제가 아니다 — 4천 토큰을 한 벡터로 뭉개면 신호가 씻긴다.
// 검색엔진도 문단 단위로 맞춘다. 조각이 더 싸고 방법론도 더 맞다.
// 예전 평가는 문서 전체 + mean 풀링이었고, 그것이 코사인을 좁은 구간에 뭉치게 했다.
const MODEL = opt('model', null);
if (MODEL) {
  const cache = openCache(`./.models/cache-${MODEL.replace(/[^\w.-]/g, '_')}.json`);

  // 임베딩은 문서당 ~14초다(bge-m3, CPU). 3만 건을 다 돌리면 3일이라 결정을 못 기다린다.
  // 통계적으로는 전부 필요하지도 않다 — 검색어를 무작위로 N개만 뽑아도
  // 쌍이 2만 개면 오차 ±0.7%p 라 계정(65.7%)과 비교하기에 충분하다.
  // `--emb-queries=0` 이면 전부 돈다.
  const EMB_Q = Number(opt('emb-queries', 0));
  let embPairs = pairs;
  if (EMB_Q > 0) {
    const qs = [...new Set(pairs.map((p) => p.query))].sort();   // 실행마다 같은 표본
    const pick = new Set(qs.filter((_, i) => i % Math.ceil(qs.length / EMB_Q) === 0));
    embPairs = pairs.filter((p) => pick.has(p.query));
    console.log(`[embed] 표본 — 검색어 ${pick.size}/${qs.length}개 · 쌍 ${embPairs.length}/${pairs.length}개`);
  }

  const need = new Set();
  for (const p of embPairs) { need.add(p.hi.url); need.add(p.lo.url); }
  // 저장 키와 같은 접두어로 확인해야 한다. `d:` 로 물으면 언제나 없다고 나와
  // 캐시가 있어도 매번 전부 다시 계산한다(실제로 그 사고가 났다).
  const missDocs = [...need].filter((u) => !cache.has(`c:${u}`));
  const queries = [...new Set(embPairs.map((p) => p.query))];
  const missQ = queries.filter((q) => !cache.has(`q:${q}`));

  // 쿼리 확장 — `"OOO 섭외"` 는 2어절이라 임베딩이 불안정하다.
  // 검색 의도를 문장으로 펼쳐 넣으면 나아지는지 본다(§7.4 사다리 2번, 이제껏 미검증).
  // 문서 벡터는 그대로라 쿼리 240건만 다시 계산하면 된다 — 1분짜리 실험이다.
  const expand = (q) => {
    const p = personOf(q);
    return `${p}을(를) 행사에 섭외하는 방법과 비용, ${p} 섭외에 적합한 행사 유형과 무대 구성, 섭외 문의 절차`;
  };
  const missQx = queries.filter((q) => !cache.has(`x:${q}`));

  console.log(`[embed] ${MODEL} — 문서 ${missDocs.length}건 · 쿼리 ${missQ.length}건 · 확장쿼리 ${missQx.length}건 새로 계산 (캐시 ${cache.size()})`);
  if (missQ.length) {
    const v = await embed(MODEL, missQ, { kind: 'query' });
    missQ.forEach((q, i) => cache.set(`q:${q}`, v[i]));
  }
  if (missQx.length) {
    const v = await embed(MODEL, missQx.map(expand), { kind: 'query' });
    missQx.forEach((q, i) => cache.set(`x:${q}`, v[i]));
    cache.save();
  }
  const t0 = Date.now();
  for (let i = 0; i < missDocs.length; i++) {
    const d = docs.get(missDocs[i]);
    const v = await embed(MODEL, chunk(d.body).slice(0, 24));
    cache.set(`c:${d.url}`, v);
    if ((i + 1) % 25 === 0 || i === missDocs.length - 1) {
      cache.save();
      const per = (Date.now() - t0) / (i + 1);
      console.log(`  ${i + 1}/${missDocs.length} — 남은 시간 약 ${Math.round((missDocs.length - i - 1) * per / 60000)}분`);
    }
  }
  cache.save();

  // 조각 평균 = 문서 벡터. 정규화해야 코사인이 된다.
  const docVec = (url) => {
    const cs = cache.getMany(`c:${url}`);
    const m = new Array(cs[0].length).fill(0);
    for (const c of cs) for (let i = 0; i < m.length; i++) m[i] += c[i] / cs.length;
    const n = Math.hypot(...m);
    return m.map((x) => x / (n || 1));
  };
  const vecCache = new Map();
  const memoVec = (url) => { if (!vecCache.has(url)) vecCache.set(url, docVec(url)); return vecCache.get(url); };

  SCORERS['임베딩 조각 평균'] = (q, d) => cosine(cache.get(`q:${q}`), memoVec(d.url));
  SCORERS['임베딩 조각 최고'] = (q, d) => {
    const qv = cache.get(`q:${q}`);
    return Math.max(...cache.getMany(`c:${d.url}`).map((cv) => cosine(qv, cv)));
  };
  const top3 = (qv, url) => {
    const s = cache.getMany(`c:${url}`).map((cv) => cosine(qv, cv)).sort((a, b) => b - a).slice(0, 3);
    return s.reduce((x, y) => x + y, 0) / s.length;
  };
  SCORERS['임베딩 조각 상위3평균'] = (q, d) => top3(cache.get(`q:${q}`), d.url);
  SCORERS['임베딩 확장쿼리 상위3'] = (q, d) => top3(cache.get(`x:${q}`), d.url);
  SCORERS['임베딩 확장쿼리 평균'] = (q, d) => cosine(cache.get(`x:${q}`), memoVec(d.url));
}

// ── 재순위 지표 (선택) ────────────────────────────────────────────────────
// 사다리 4번. 쿼리와 조각을 **함께** 넣어 관련도를 직접 낸다.
const RERANKER = opt('reranker', null);
if (RERANKER) {
  const scores = openCache(`./.models/rr-${RERANKER.replace(/[^\w.-]/g, '_')}.json`);
  const todo = [];
  for (const p of pairs)
    for (const d of [p.hi, p.lo]) {
      const k = `${p.query}|${d.url}`;
      if (!scores.has(k)) todo.push({ k, query: p.query, url: d.url });
    }
  const uniq = [...new Map(todo.map((t) => [t.k, t])).values()];
  console.log(`[rerank] ${RERANKER} — ${uniq.length}건 채점 (캐시 ${scores.size()})`);
  const t0 = Date.now();
  for (let i = 0; i < uniq.length; i++) {
    const { k, query, url } = uniq[i];
    const s = await rerank(RERANKER, query, chunk(docs.get(url).body).slice(0, 24));
    scores.set(k, [s]);   // 캐시는 행렬만 다룬다 — 점수 배열을 한 행으로 넣는다
    if ((i + 1) % 100 === 0 || i === uniq.length - 1) {
      scores.save();
      const per = (Date.now() - t0) / (i + 1);
      console.log(`  ${i + 1}/${uniq.length} — 남은 시간 약 ${Math.round((uniq.length - i - 1) * per / 60000)}분`);
    }
  }
  scores.save();
  const arr = (q, d) => scores.get(`${q}|${d.url}`);
  SCORERS['재순위 조각 최고'] = (q, d) => Math.max(...arr(q, d));
  SCORERS['재순위 조각 상위3'] = (q, d) => {
    const s = [...arr(q, d)].sort((a, b) => b - a).slice(0, 3);
    return s.reduce((x, y) => x + y, 0) / s.length;
  };
  SCORERS['재순위 조각 평균'] = (q, d) => { const s = arr(q, d); return s.reduce((x, y) => x + y, 0) / s.length; };
}

// 동점은 반반으로 센다 — 안 그러면 0/1 짜리 이진 지표가 부당하게 유리해진다.
// 임베딩을 일부 표본에만 계산했으면, 벡터가 없는 쌍에서 점수가 NaN 이 되거나 예외가 난다.
// 그걸 0 으로 세면 그 지표만 부당하게 깎인다 — **잴 수 있는 쌍에서만** 재고, 몇 쌍인지 같이 적는다.
const safe = (fn, q, d) => {
  try { const v = fn(q, d); return Number.isFinite(v) ? v : NaN; }
  catch { return NaN; }
};

function evaluate(fn) {
  let win = 0, tie = 0, n = 0;
  for (const p of pairs) {
    const a = safe(fn, p.query, p.hi), b = safe(fn, p.query, p.lo);
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    n++;
    if (a === b) tie++;
    else if (a > b) win++;
  }
  return { acc: n ? (win + tie / 2) / n : 0.5, tiePct: n ? tie / n : 0, n };
}

// 블로그 정체성만으로 얼마나 맞히나 — "문서가 아니라 계정이 순위를 만드는가"의 답.
// 누수를 막으려 각 쌍의 기여를 뺀 승률로 비교한다(leave-one-out).
const blogWin = new Map();
for (const p of pairs) {
  for (const [b, won] of [[p.hi.blog_id, 1], [p.lo.blog_id, 0]]) {
    const s = blogWin.get(b) ?? { w: 0, n: 0 };
    s.w += won; s.n++;
    blogWin.set(b, s);
  }
}
const blogScore = (pair, which) => {
  const s = blogWin.get(pair[which].blog_id);
  const w = s.w - (which === 'hi' ? 1 : 0), n = s.n - 1;
  return n > 0 ? w / n : 0.5;
};
let bWin = 0, bTie = 0;
for (const p of pairs) {
  const a = blogScore(p, 'hi'), b = blogScore(p, 'lo');
  if (a === b) bTie++;
  else if (a > b) bWin++;
}

// 계정 효과를 걷어내고 문서 지표를 다시 본다.
//
// 블로그 기준선이 높다고 해서 "문서는 무관하다"가 되지는 않는다 — 그 기준선은
// 계정 지수와 "그 블로그가 원래 글을 잘 쓴다"를 같이 삼키고 있다.
// 그래서 **두 블로그의 승률이 비슷한 쌍**(계정 우열이 없는 판)만 따로 재본다.
// 여기서 문서 지표가 뛰면 계정에 가려져 있던 문서 신호가 있다는 뜻이고,
// 그대로면 문서 모델의 여지가 작다는 뜻이다.
const gap = (p) => Math.abs(blogScore(p, 'hi') - blogScore(p, 'lo'));
const evenPairs = pairs.filter((p) => gap(p) <= 0.15);
function evaluateOn(subset, fn) {
  let win = 0, tie = 0, n = 0;
  for (const p of subset) {
    const a = safe(fn, p.query, p.hi), b = safe(fn, p.query, p.lo);
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    n++;
    if (a === b) tie++;
    else if (a > b) win++;
  }
  return n ? (win + tie / 2) / n : 0.5;
}

const nq = new Set(pairs.map((p) => p.query)).size;
console.log(`\n순위 재현율 — ${SURFACE} · 문서쌍 ${pairs.length}개 · 쿼리 ${nq}개`);
console.log(`(순서가 흔들려 버린 쌍 ${dropUnstable} · 검색어와 무관해 버린 쌍 ${dropOfftopic} · 본문 확보 ${docs.size}건)\n`);
console.log('  지표'.padEnd(22) + '재현율   동점   쌍     읽는 법');
const rows = Object.entries(SCORERS)
  .map(([name, fn]) => ({ name, ...evaluate(fn) }))
  .sort((a, b) => Math.abs(b.acc - 0.5) - Math.abs(a.acc - 0.5));
for (const r of rows) {
  const read = Math.abs(r.acc - 0.5) < 0.03
    ? '판별 못 함'
    : r.acc >= 0.5 ? '높을수록 상위' : '낮을수록 상위';
  console.log(`  ${r.name.padEnd(20)}${(r.acc * 100).toFixed(1)}%   ${String((r.tiePct * 100).toFixed(0)).padStart(2)}%   ${String(r.n).padStart(6)}  ${read}`);
}
console.log(`\n  ${'[블로그 정체성만]'.padEnd(20)}${(((bWin + bTie / 2) / pairs.length) * 100).toFixed(1)}%   ${((bTie / pairs.length) * 100).toFixed(0)}%    문서를 안 보고 계정만으로`);
console.log(`\n  표본 ${pairs.length}쌍의 통계 오차는 대략 ±${(100 / Math.sqrt(pairs.length)).toFixed(1)}%p.`);

if (evenPairs.length >= 100) {
  console.log(`\n계정 우열이 없는 판만 (블로그 승률 차 0.15 이하) — ${evenPairs.length}쌍, 오차 ±${(100 / Math.sqrt(evenPairs.length)).toFixed(1)}%p`);
  console.log('  지표'.padEnd(22) + '전체     계정 대등판   차이');
  for (const r of rows) {
    const e = evaluateOn(evenPairs, SCORERS[r.name]);
    const d = (e - r.acc) * 100;
    console.log(`  ${r.name.padEnd(20)}${(r.acc * 100).toFixed(1)}%    ${(e * 100).toFixed(1)}%       ${d >= 0 ? '+' : ''}${d.toFixed(1)}%p`);
  }
  console.log('  → 여기서 오르는 지표가 계정에 가려져 있던 문서 신호다. 그대로면 문서 모델의 여지가 작다.');
}
// ── 짝지은 비교 ────────────────────────────────────────────────────────────
// 두 지표를 **같은 쌍들** 위에서 비교하므로 오차가 표의 ±값보다 훨씬 작다.
// 표의 ±2.1%p 는 "이 지표가 50%와 다른가"의 오차이지, "A가 B보다 나은가"의 오차가 아니다.
// 새 모델이 기존 최고를 실제로 넘었는지는 반드시 이 칸으로 판단한다.
function pairedDiff(subset, fnA, fnB, iters = 2000) {
  const s = (fn, p) => {
    const a = safe(fn, p.query, p.hi), b = safe(fn, p.query, p.lo);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return a === b ? 0.5 : a > b ? 1 : 0;
  };
  // 임베딩이 표본에만 있으면 벡터 없는 쌍은 잴 수 없다 — 둘 다 잴 수 있는 쌍만 남긴다.
  const d = subset
    .map((p) => [s(fnA, p), s(fnB, p)])
    .filter(([a, b]) => a !== null && b !== null)
    .map(([a, b]) => a - b);
  if (!d.length) return { mean: 0, lo: 0, hi: 0, n: 0 };
  const mean = d.reduce((x, y) => x + y, 0) / d.length;
  const boots = [];
  for (let i = 0; i < iters; i++) {
    let t = 0;
    for (let j = 0; j < d.length; j++) t += d[(Math.random() * d.length) | 0];
    boots.push(t / d.length);
  }
  boots.sort((a, b) => a - b);
  return { mean, lo: boots[Math.floor(iters * 0.025)], hi: boots[Math.floor(iters * 0.975)] };
}

const isModel = (n) => n.startsWith('임베딩') || n.startsWith('재순위');
const modelRows = rows.filter((r) => isModel(r.name));
if (modelRows.length) {
  const bestLex = rows.find((r) => !isModel(r.name));
  const bestModel = modelRows[0];
  console.log(`\n짝지은 비교 — "${bestModel.name}" 빼기 "${bestLex.name}" (95% 신뢰구간)`);
  for (const [label, subset] of [['전체', pairs], ['계정 대등판', evenPairs]]) {
    const r = pairedDiff(subset, SCORERS[bestModel.name], SCORERS[bestLex.name]);
    const verdict = r.lo > 0 ? '유의미하게 낫다' : r.hi < 0 ? '유의미하게 못하다' : '차이 없다고 봐야 한다';
    console.log(`  ${label.padEnd(12)}${(r.mean * 100 >= 0 ? '+' : '')}${(r.mean * 100).toFixed(1)}%p  [${(r.lo * 100).toFixed(1)}, ${(r.hi * 100).toFixed(1)}]  → ${verdict}`);
  }
}
console.log('\n  새 지표·모델은 SCORERS 에 한 줄 추가해 이 표에서 비교한다.\n');
