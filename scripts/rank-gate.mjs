#!/usr/bin/env node
// "무엇이 **노출 여부**를 가르는가" 를 재는 자.
//
//   node scripts/rank-gate.mjs
//   node scripts/rank-gate.mjs --surface=blog-tab --window=60
//
// rank-eval.mjs 와 무엇이 다른가 — 이것이 이 파일이 따로 있는 이유다:
//
//   rank-eval 은 **상위 10위 안에 든 글끼리** 순서를 맞힌다. 그래서 "10위 안에
//   들어가느냐"를 가르는 요인은 구조적으로 볼 수 없다. 상위 10개는 이미 전부
//   어떤 관문을 통과한 글이고, 우리는 통과자끼리만 비교하고 있었다.
//   품질이 순서가 아니라 **관문**에서 작동한다면 rank-eval 은 영원히 못 본다.
//
//   이 자는 반대편을 본다. 우리 발행 원고는 노출 실패도 기록에 남는다
//   (`mih_serp_checks.indexed=false`). 그래서 **한 번도 못 뜬 글**과 **꾸준히 뜨는 글**을
//   직접 맞세울 수 있다. 생존자 편향이 없는 유일한 표본이다.
//
// 짝짓기 규칙 — 계정과 시기를 짝 안에서 묶어 없앤다:
//   같은 계정 · 발행일 차 N일 이내 · 노출률 차 0.5 이상.
// 그래야 남는 차이가 원고 자체에서 온 것이다.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { extractStructure } from './lib/naver-post.mjs';
import { FEATURES, strip } from './lib/gate-features.mjs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };

const SURFACE = opt('surface', 'pc-total');
const WINDOW = Number(opt('window', 30));      // 발행일 차 허용 범위(일)
const MIN_OBS = Number(opt('min-obs', 3));     // 관측이 적으면 노출률이 못 미덥다
const MIN_GAP = Number(opt('gap', 0.5));       // 노출률 차이가 이만큼은 나야 한 짝

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

const arts = new Map(
  (await page('articles', 'id,agency,person_name,title,published_at,html_content'))
    .filter((a) => a.published_at && a.html_content)
    .map((a) => [a.id, a])
);

// 노출률 — 관측 여러 날을 평균한다. 하루짜리 관측은 순위 흔들림에 통째로 휘둘린다.
const obs = new Map();
for (const c of await page('mih_serp_checks', 'article_id,indexed,surface', (q) => q.not('article_id', 'is', null))) {
  if (c.surface !== SURFACE) continue;
  const o = obs.get(c.article_id) ?? { n: 0, idx: 0 };
  o.n++; if (c.indexed) o.idx++;
  obs.set(c.article_id, o);
}

const docs = [];
for (const [id, o] of obs) {
  const a = arts.get(id);
  if (!a || o.n < MIN_OBS) continue;
  const body = strip(a.html_content);
  if (body.length < 200) continue;
  docs.push({
    ...a, rate: o.idx / o.n, obs: o.n, body, len: body.length,
    struct: extractStructure(`<div class="se-main-container">${a.html_content}</div>`) ?? {},
    t: new Date(a.published_at).getTime(),
  });
}

// 같은 계정 · 비슷한 시기 · 노출률이 확실히 갈리는 짝
const pairs = [];
for (let i = 0; i < docs.length; i++)
  for (let j = i + 1; j < docs.length; j++) {
    const a = docs[i], b = docs[j];
    if (a.agency !== b.agency) continue;
    if (Math.abs(a.t - b.t) > WINDOW * 86400000) continue;
    if (Math.abs(a.rate - b.rate) < MIN_GAP) continue;
    pairs.push(a.rate > b.rate ? { hi: a, lo: b } : { hi: b, lo: a });
  }

if (pairs.length < 30) {
  console.log(`짝이 ${pairs.length}개뿐이다 — 조건을 넓혀라 (--window / --gap).`);
  process.exit(0);
}

const SCORERS = {
  '최신성(발행일)': (d) => d.t,
  ...FEATURES,
  '이미지 수': (d) => d.struct.img ?? NaN,
  '영상 수': (d) => d.struct.video ?? NaN,
  '표 수': (d) => d.struct.table ?? NaN,
  '문단 수': (d) => d.struct.para ?? NaN,
};

const safe = (fn, d) => { try { const v = fn(d); return Number.isFinite(v) ? v : NaN; } catch { return NaN; } };
const rows = Object.entries(SCORERS).map(([name, fn]) => {
  let win = 0, tie = 0, n = 0;
  for (const p of pairs) {
    const a = safe(fn, p.hi), b = safe(fn, p.lo);
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    n++;
    if (a === b) tie++; else if (a > b) win++;
  }
  return { name, acc: n ? (win + tie / 2) / n : 0.5, tie: n ? tie / n : 0, n };
}).sort((a, b) => Math.abs(b.acc - 0.5) - Math.abs(a.acc - 0.5));

const nHi = new Set(pairs.map((p) => p.hi.id)).size, nLo = new Set(pairs.map((p) => p.lo.id)).size;
console.log(`\n노출 재현율 — ${SURFACE} · 짝 ${pairs.length}개 (뜨는 글 ${nHi}편 vs 안 뜨는 글 ${nLo}편)`);
console.log(`(같은 계정 · 발행일 차 ${WINDOW}일 이내 · 노출률 차 ${MIN_GAP} 이상 · 관측 ${MIN_OBS}일 이상)\n`);
console.log('  지표'.padEnd(22) + '재현율   동점   짝     읽는 법');
for (const r of rows) {
  const read = Math.abs(r.acc - 0.5) < 0.03 ? '판별 못 함' : r.acc >= 0.5 ? '높을수록 노출' : '낮을수록 노출';
  console.log(`  ${r.name.padEnd(20)}${(r.acc * 100).toFixed(1)}%   ${String((r.tie * 100).toFixed(0)).padStart(3)}%  ${String(r.n).padStart(6)}  ${read}`);
}

// ── 오차는 짝이 아니라 **원고** 단위로 잰다 ────────────────────────────────
// 짝 824개는 독립이 아니다. 원고 105편에서 나온 것이라 같은 원고가 수십 번 재등장한다.
// 짝 수로 낸 ±3.5%p 는 사실보다 서너 배 좁다. 원고를 다시 뽑는 부트스트랩으로 잰다.
const hiIds = [...new Set(pairs.map((p) => p.hi.id))];
const loIds = [...new Set(pairs.map((p) => p.lo.id))];
const pairIdx = new Map();
for (const p of pairs) pairIdx.set(`${p.hi.id}|${p.lo.id}`, p);
// 지표 값은 원고마다 한 번만 계산해 둔다. 부트스트랩은 값 조회만 한다 —
// 매번 본문을 다시 쪼개면 수천만 번이 되어 끝나지 않는다(10분을 넘겨 죽였다).
const cache = new Map();
for (const [name, fn] of Object.entries(SCORERS)) {
  const m = new Map();
  for (const d of docs) m.set(d.id, safe(fn, d));
  cache.set(name, m);
}
function bootCI(name, iters = 400) {
  const v = cache.get(name);
  const out = [];
  for (let it = 0; it < iters; it++) {
    const H = Array.from({ length: hiIds.length }, () => hiIds[(Math.random() * hiIds.length) | 0]);
    const L = Array.from({ length: loIds.length }, () => loIds[(Math.random() * loIds.length) | 0]);
    let win = 0, n = 0;
    for (const h of H) for (const l of L) {
      if (!pairIdx.has(h + '|' + l)) continue;
      const a = v.get(h), b = v.get(l);
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      n++; win += a === b ? 0.5 : a > b ? 1 : 0;
    }
    if (n) out.push(win / n);
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]];
}
console.log(`\n원고 단위 95% 신뢰구간 — 짝 ${pairs.length}개가 아니라 원고 ${hiIds.length + loIds.length}편을 다시 뽑아서 잰다`);
for (const r of rows) {
  if (r.tie > 0.9) continue;
  const [lo, hi] = bootCI(r.name);
  const mark = lo > 0.5 || hi < 0.5 ? '' : '   ← 50%를 못 벗어난다';
  console.log(`  ${r.name.padEnd(20)}${(r.acc * 100).toFixed(1)}%  [${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}]${mark}`);
}
console.log('\n  동점률이 90%를 넘는 지표는 **변량이 없어 판정 불가**다 — 무관하다는 뜻이 아니다.\n');
