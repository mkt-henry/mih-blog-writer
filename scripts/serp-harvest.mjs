#!/usr/bin/env node
// 순위 학습 데이터를 **능동적으로** 모은다.
//
//   node scripts/serp-harvest.mjs --pilot=30        # 속도·차단률만 재고 끝
//   node scripts/serp-harvest.mjs --limit=500       # 500개 검색어 수집
//   node scripts/serp-harvest.mjs --stats
//
// 기존 노출 KPI 크론은 **우리가 발행한 글**의 순위만 본다(하루 수십 건). 그것만으로
// 학습 데이터를 채우려면 몇 달이 걸린다. 이 스크립트는 아직 안 써 본 인물 검색어로
// 직접 검색해 **상위 노출 중인 남의 글**을 순위와 함께 모은다.
//
// ⚠ 403 이 나기 시작하면 **같은 IP 를 쓰는 일일 노출 KPI 크론까지 막힌다.**
// 그래서 빠르기보다 안 막히는 쪽으로 맞췄다 — 아래 "요청 예절" 참조.
// 중간에 끊겨도 안전하다. 다시 돌리면 아직 안 해 본 검색어부터 이어간다.
//
// 결과는 `mih_serp_checks` 에 `note='harvest'` 로 들어간다 — 노출 KPI 집계와 섞이지 않게
// article_id 는 비운다. 본문은 `npm run serp:corpus` 가 이어서 받는다.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const num = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const POST_LINK = /(?:https?:)?\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/g;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 요청 예절 ──────────────────────────────────────────────────────────────
// 이 작업 때문에 IP 가 막히면 **일일 노출 KPI 크론까지 같이 끊긴다.** 그래서 빠르기보다
// 안 막히는 쪽으로 맞췄다. 며칠 걸려도 상관없다는 전제다.
//
//  - 기본 간격 5초(크론의 6배 느리게)에 매번 흔들어 준다. 일정한 간격이 오히려 눈에 띈다.
//  - 100개마다 2~5분 쉰다. 사람이 쉬지 않고 5,800번 검색하지 않는다.
//  - 403 이 나면 5분 쉬고, 그 뒤로 간격을 영구히 1.5배 늘린다(한 번 미움받으면 더 조심한다).
//  - 3회 연속이면 그날은 접는다. 밀어붙이면 IP 가 더 오래 묶인다.
const BASE_GAP_MS = num('gap', 5000);
const JITTER = 0.6;                 // 간격을 ±60% 흔든다
const BREAK_EVERY = num('break-every', 100);
const ABORT_AFTER_BLOCKS = 3;
const BLOCK_COOLDOWN_MS = 5 * 60_000;

let gapMs = BASE_GAP_MS;
const jittered = () => Math.round(gapMs * (1 + (Math.random() * 2 - 1) * JITTER));

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

async function fetchSerp(query, surface) {
  const q = `query=${encodeURIComponent(query)}`;
  const url = surface === 'blog-tab'
    ? `https://search.naver.com/search.naver?ssc=tab.blog.all&${q}`
    : `https://search.naver.com/search.naver?${q}`;
  // 타임아웃·DNS 끊김은 예외로 던져진다. 잡지 않으면 프로세스가 통째로 죽고
  // 그 라운드에서 아직 저장 안 한 결과까지 날아간다 — 빈 결과로 넘기고 계속 간다.
  let res, html;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { blocked: res.status === 403, status: res.status, entries: [] };
    html = await res.text();
  } catch (e) {
    return { blocked: false, status: 0, entries: [], error: e.name || String(e) };
  }
  const entries = [], seen = new Set();
  for (const m of html.matchAll(POST_LINK)) {
    const u = `https://blog.naver.com/${m[1]}/${m[2]}`;
    if (seen.has(u)) continue;
    seen.add(u);
    entries.push({ rank: entries.length + 1, url: u, slug: m[1] });
  }
  return { blocked: false, status: 200, entries };
}

// 등록된 이름에는 설명이 괄호로 붙어 있는 경우가 많다("이세영 (무니)").
// 네이버는 이걸 그대로 넣으면 결과를 0건으로 돌려준다 — 실제로 "이세영 (무니) 섭외" 0건,
// "이세영 섭외" 10건이었다. 괄호를 떼고 검색한다.
const clean = (k) => k.replace(/[（(][^）)]*[）)]/g, ' ').replace(/\s+/g, ' ').trim();

const kws = await page('keywords', 'id,keyword,category,is_active');
const done = new Set((await page('mih_serp_checks', 'query')).map((r) => r.query));
const todo = [...new Set(kws
  .filter((k) => k.is_active !== false && k.keyword && clean(k.keyword))
  // 옛 행은 괄호가 붙은 원본으로 저장돼 있다. 둘 중 하나라도 있으면 이미 한 것이다.
  .filter((k) => !done.has(`${k.keyword} 섭외`) && !done.has(`${clean(k.keyword)} 섭외`))
  .map((k) => `${clean(k.keyword)} 섭외`))];

if (args.includes('--stats')) {
  const docs = await page('mih_serp_docs', 'url');
  console.log(JSON.stringify({
    검색어_남음: todo.length, 이미_검색함: done.size, 본문_확보: docs.length,
  }, null, 2));
  process.exit(0);
}

const PILOT = num('pilot', 0);
const limit = PILOT || num('limit', todo.length);
const targets = todo.slice(0, limit);
console.log(`[serp-harvest] ${PILOT ? '파일럿 ' : ''}검색어 ${targets.length}개 · 간격 ${BASE_GAP_MS}ms±${Math.round(JITTER*100)}% · ${BREAK_EVERY}개마다 휴식`);

const t0 = Date.now();
let ok = 0, blocked = 0, empty = 0, blockStreak = 0;
const urls = new Set();
const rows = [];
const emptyRows = [];   // 대조 검색을 통과해야 저장한다

// 결과가 확실히 나오는 검색어로 한 번 두드려 본다. 여기서도 0건이면 우리가 막힌 것이지
// 검색어가 없는 게 아니다 — 그 구간의 빈 결과는 버린다(다음 라운드에 다시 해 본다).
async function settleEmpties() {
  if (!emptyRows.length) return true;
  const probe = await fetchSerp('아이유 섭외', 'pc-total');
  if (!probe.entries.length) { emptyRows.length = 0; return false; }
  const { error } = await db.from('mih_serp_checks').insert(emptyRows.splice(0, emptyRows.length));
  if (error) console.error('  빈결과 저장 실패:', error.message);
  return true;
}

for (let i = 0; i < targets.length; i++) {
  const query = targets[i];
  // 통합검색만 받는다 — 학습에 필요한 것은 "네이버가 매긴 순서"이고, 블로그 탭까지
  // 받으면 요청이 두 배가 되어 차단 위험만 커진다.
  const r = await fetchSerp(query, 'pc-total');
  if (r.blocked) {
    blocked++; blockStreak++;
    await flush();                        // 지금까지 모은 것은 잃지 않는다
    if (blockStreak >= ABORT_AFTER_BLOCKS) {
      console.error(`\n⛔ 403 이 ${blockStreak}회 연속 — 오늘은 접는다. 다시 돌리면 남은 것부터 이어간다.`);
      break;
    }
    gapMs = Math.round(gapMs * 1.5);      // 한 번 막혔으면 그 뒤로 더 조심한다
    console.log(`  ⚠ 403 — ${BLOCK_COOLDOWN_MS / 60000}분 쉬고 간격을 ${gapMs}ms 로 올린다`);
    await sleep(BLOCK_COOLDOWN_MS);
    continue;
  }
  blockStreak = 0;
  if (!r.entries.length) {
    // 빈 결과를 기록하지 않으면 그 검색어는 라운드마다 영원히 다시 돌아온다.
    // 다만 네이버가 200 을 주면서 결과만 비우는 **소프트 차단**도 똑같이 빈 결과로 보인다.
    // 그래서 바로 저장하지 않고 모아 뒀다가, 휴식 때 대조 검색으로 멀쩡한지 확인되면 저장한다.
    empty++;
    emptyRows.push({
      article_id: null, query, surface: 'pc-total',
      indexed: false, rank: null, note: 'harvest', competitors: [],
    });
  } else {
    ok++;
    for (const e of r.entries) urls.add(e.url);
    rows.push({
      article_id: null, query, surface: 'pc-total',
      indexed: false, rank: null, note: 'harvest',
      competitors: r.entries.slice(0, 10),
    });
  }
  if (rows.length >= 50) { await flush(); }
  if ((i + 1) % 25 === 0 || i === targets.length - 1) {
    const per = (Date.now() - t0) / (i + 1);
    console.log(`  ${i + 1}/${targets.length} — 성공 ${ok} · 빈결과 ${empty} · 차단 ${blocked} · 문서 ${urls.size}건 · 남은 시간 약 ${Math.round((targets.length - i - 1) * per / 60000)}분`);
  }
  await sleep(jittered());
  // 사람이 쉬지 않고 수천 번 검색하지 않는다. 긴 휴식이 차단을 가장 확실히 막는다.
  if (BREAK_EVERY && (i + 1) % BREAK_EVERY === 0 && i < targets.length - 1) {
    const rest = 120_000 + Math.random() * 180_000;
    await flush();
    if (!(await settleEmpties())) {
      console.error('\n⛔ 대조 검색도 0건 — 소프트 차단으로 보고 오늘은 접는다.');
      break;
    }
    console.log(`  … ${Math.round(rest / 60000)}분 휴식`);
    await sleep(rest);
  }
}
await flush();
await settleEmpties();

async function flush() {
  if (!rows.length) return;
  const { error } = await db.from('mih_serp_checks').insert(rows.splice(0, rows.length));
  if (error) console.error('  저장 실패:', error.message);
}

const mins = (Date.now() - t0) / 60000;
console.log(`\n[serp-harvest] 검색어 ${ok}개 성공 · 문서 ${urls.size}건 발견 · ${mins.toFixed(1)}분`);
if (ok) {
  const perQuery = urls.size / ok;
  console.log(`  검색어당 문서 ${perQuery.toFixed(1)}건 · 분당 검색어 ${(ok / mins).toFixed(1)}개`);
  console.log(`  차단률 ${(100 * blocked / (ok + blocked + empty)).toFixed(1)}%`);
  const need = 10000;
  console.log(`  → 문서 ${need}건까지 검색어 약 ${Math.ceil(need / perQuery)}개, 약 ${(Math.ceil(need / perQuery) / (ok / mins) / 60).toFixed(1)}시간`);
}
console.log('  본문은 이어서 `npm run serp:corpus` 로 받는다.\n');
