#!/usr/bin/env node
// 순위 데이터셋의 본문을 모은다.
//
//   node scripts/serp-corpus.mjs            # 아직 안 받은 것 전부
//   node scripts/serp-corpus.mjs --limit=200
//   node scripts/serp-corpus.mjs --stats     # 받지 않고 현황만
//
// `mih_serp_checks.competitors` 에 등장한 모든 URL + 우리 발행 원고를
// `mih_serp_docs` 에 순수 텍스트로 적재한다. 이미 있는 URL은 건너뛴다(재수집 안 함).
//
// 예절: 순차 + 흔들린 간격 + 429/5xx 지수 백오프. 중간에 끊겨도 안전하다 —
// 다음 실행이 못 받은 것부터 이어 간다.
//
// ⚠ 검색 수집(`serp-harvest`)과 **동시에 돌리지 않는다.** 같은 IP 에서 나가는 요청이
// 두 배가 되어 차단 위험이 커진다. 검색을 먼저 끝내고 본문을 받는다.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fetchPost, sleep, extractStructure } from './lib/naver-post.mjs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const num = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? +a.split('=')[1] : d; };

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

const canonical = (u) => String(u).split('?')[0].replace(/\/$/, '');

const checks = await page('mih_serp_checks', 'query,competitors');
const wanted = new Map();               // canonical url -> {}
for (const c of checks)
  for (const k of c.competitors ?? [])
    if (k?.url) wanted.set(canonical(k.url), true);

// 우리 글도 같은 코퍼스에 넣는다 — 경쟁 글과 나란히 놓고 비교해야 의미가 있다.
const ours = await page('articles', 'published_url,html_content', (q) => q.not('published_url', 'is', null));
const ourUrls = new Map();
for (const a of ours) ourUrls.set(canonical(a.published_url), a.html_content ?? '');

const rows = await page('mih_serp_docs', 'url,body,struct');
const have = new Set(rows.map((r) => r.url));

// ── 구성 보충 모드 (`--struct`) ─────────────────────────────────────────────
// 본문은 이미 다 받았지만 **구성**(이미지·영상·표·소제목 개수)은 없다 —
// 처음 받을 때 HTML 을 버리고 텍스트만 저장했기 때문이다. 그래서 다시 받는다.
//
// 문서를 아무거나 고르면 안 된다. 순위 평가는 **같은 검색어 안의 두 글을 비교**하므로
// 한쪽만 구성이 있으면 그 쌍은 못 쓴다. 검색어 단위로, 문서가 많이 걸린 검색어부터
// 통째로 채운다 — 문서 k개를 받으면 쌍은 약 k²/2개가 생기니 큰 검색어가 압도적으로 싸다.
const STRUCT = args.includes('--struct');
const needStruct = new Set(rows.filter((r) => r.body && !r.struct).map((r) => r.url));
let structTodo = [];
if (STRUCT) {
  const byQuery = new Map();
  for (const c of checks) {
    const urls = (c.competitors ?? []).map((k) => k?.url).filter(Boolean).map(canonical)
      .filter((u) => have.has(u));
    if (urls.length >= 2) byQuery.set(c.query, new Set([...(byQuery.get(c.query) ?? []), ...urls]));
  }
  const seen = new Set();
  for (const [, urls] of [...byQuery].sort((a, b) => b[1].size - a[1].size))
    for (const u of urls)
      if (needStruct.has(u) && !seen.has(u)) { seen.add(u); structTodo.push(u); }
}

const todo = STRUCT
  ? structTodo
  : [...new Set([...wanted.keys(), ...ourUrls.keys()])].filter((u) => !have.has(u));

if (args.includes('--stats')) {
  console.log(JSON.stringify({
    경쟁문서: wanted.size, 우리글: ourUrls.size, 이미받음: have.size, 남음: todo.length,
    구성없음: needStruct.size, 구성있음: rows.filter((r) => r.struct).length,
  }, null, 2));
  process.exit(0);
}

const limit = num('limit', todo.length);
// 간격을 흔든다 — 일정한 간격이 오히려 눈에 띈다. 기본 1.5초(종전 0.7초).
const BASE_GAP = num('gap', 1500);
const jittered = () => Math.round(BASE_GAP * (1 + (Math.random() * 2 - 1) * 0.5));
const targets = todo.slice(0, limit);
console.log(`[serp-corpus]${STRUCT ? ' 구성 보충 —' : ''} 대상 ${targets.length}건 (전체 남음 ${todo.length})`);

// 우리 글은 네이버에서 다시 받지 않는다 — DB 에 원본 HTML 이 있다.
const stripOurs = (h) => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ')
  .replace(/\s+/g, ' ').trim();

// 삭제된 글·본문 없는 글은 다시 받아 봐야 결과가 같다 — 기록하고 끝낸다.
// 반대로 차단·타임아웃 같은 **일시적** 실패를 기록해 버리면 그 글은 목록에서 영영 빠진다
// (목록은 `mih_serp_docs` 에 없는 것만 고른다). 그래서 일시적 실패는 저장하지 않는다.
const SETTLED = new Set(['noPost', 'no-container', 'bad-url']);
const ABORT_AFTER_FAILS = 20;

let ok = 0, dead = 0, fail = 0, local = 0, failStreak = 0;
for (let i = 0; i < targets.length; i++) {
  const url = targets[i];
  const isOurs = ourUrls.has(url);
  const localHtml = isOurs ? ourUrls.get(url) : '';
  const r = localHtml && localHtml.length > 500
    ? { ok: true, status: 200, title: null, text: stripOurs(localHtml), struct: extractStructure(`<div class="se-main-container">${localHtml}</div>`) }
    : await fetchPost(url);
  if (localHtml && localHtml.length > 500) local++;
  // 구성 보충 모드는 struct 만 갱신한다 — 본문·제목을 덮어쓰면
  // 이미 평가에 쓰고 있는 텍스트가 조용히 달라진다.
  const row = STRUCT
    ? { url, struct: r.struct ?? null }
    : {
        url, is_ours: isOurs, status: r.status, note: r.note ?? null,
        blog_id: r.blogId ?? null, log_no: r.logNo ?? null,
        title: r.title ?? null, body: r.text ?? null, char_len: r.text?.length ?? null,
        fetched_at: new Date().toISOString(),
      };
  const transient = !r.ok && !SETTLED.has(r.note);
  if (!transient && !(STRUCT && !r.struct)) {
    const { error } = await db.from('mih_serp_docs').upsert(row, { onConflict: 'url' });
    if (error) console.error(`  upsert 실패 ${url}: ${error.message}`);
  }
  if (r.ok) ok++; else if (r.note === 'noPost') dead++; else fail++;

  // 연속으로 계속 실패하면 우리가 막힌 것이다. 밀어붙이면 차단만 길어지므로 라운드를 접는다.
  failStreak = transient ? failStreak + 1 : 0;
  if (failStreak >= ABORT_AFTER_FAILS) {
    console.error(`
⛔ ${failStreak}건 연속 실패 — 차단으로 보고 접는다. 다시 돌리면 남은 것부터 이어간다.`);
    break;
  }
  if ((i + 1) % 50 === 0 || i === targets.length - 1)
    console.log(`  ${i + 1}/${targets.length} — 본문 ${ok}(로컬 ${local}) · 삭제 ${dead} · 실패 ${fail}`);
  if (!(localHtml && localHtml.length > 500)) await sleep(jittered());   // 네트워크를 안 탔으면 기다릴 이유가 없다
  // 200건마다 길게 쉰다. 사람이 쉬지 않고 수만 건을 열지 않는다.
  if ((i + 1) % 200 === 0 && i < targets.length - 1) {
    const rest = 60_000 + Math.random() * 120_000;
    console.log(`  … ${Math.round(rest / 60000)}분 휴식`);
    await sleep(rest);
  }
}
console.log(`[serp-corpus] 완료 — 본문 ${ok}(로컬 ${local}) · 삭제 ${dead} · 실패 ${fail}`);
