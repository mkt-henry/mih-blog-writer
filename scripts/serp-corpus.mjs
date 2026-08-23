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
import { fetchPost, sleep } from './lib/naver-post.mjs';

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

const have = new Set((await page('mih_serp_docs', 'url')).map((r) => r.url));
const todo = [...new Set([...wanted.keys(), ...ourUrls.keys()])].filter((u) => !have.has(u));

if (args.includes('--stats')) {
  console.log(JSON.stringify({
    경쟁문서: wanted.size, 우리글: ourUrls.size, 이미받음: have.size, 남음: todo.length,
  }, null, 2));
  process.exit(0);
}

const limit = num('limit', todo.length);
// 간격을 흔든다 — 일정한 간격이 오히려 눈에 띈다. 기본 1.5초(종전 0.7초).
const BASE_GAP = num('gap', 1500);
const jittered = () => Math.round(BASE_GAP * (1 + (Math.random() * 2 - 1) * 0.5));
const targets = todo.slice(0, limit);
console.log(`[serp-corpus] 대상 ${targets.length}건 (전체 미수집 ${todo.length})`);

// 우리 글은 네이버에서 다시 받지 않는다 — DB 에 원본 HTML 이 있다.
const stripOurs = (h) => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ')
  .replace(/\s+/g, ' ').trim();

let ok = 0, dead = 0, fail = 0, local = 0;
for (let i = 0; i < targets.length; i++) {
  const url = targets[i];
  const isOurs = ourUrls.has(url);
  const localHtml = isOurs ? ourUrls.get(url) : '';
  const r = localHtml && localHtml.length > 500
    ? { ok: true, status: 200, title: null, text: stripOurs(localHtml) }
    : await fetchPost(url);
  if (localHtml && localHtml.length > 500) local++;
  const row = {
    url, is_ours: isOurs, status: r.status, note: r.note ?? null,
    blog_id: r.blogId ?? null, log_no: r.logNo ?? null,
    title: r.title ?? null, body: r.text ?? null, char_len: r.text?.length ?? null,
    fetched_at: new Date().toISOString(),
  };
  const { error } = await db.from('mih_serp_docs').upsert(row, { onConflict: 'url' });
  if (error) console.error(`  upsert 실패 ${url}: ${error.message}`);
  if (r.ok) ok++; else if (r.note === 'noPost') dead++; else fail++;
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
