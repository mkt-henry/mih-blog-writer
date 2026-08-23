#!/usr/bin/env node
// 순위 학습 데이터 수집 파이프라인 — 사람이 자리를 비워도 끝까지 간다.
//
//   node scripts/serp-pipeline.mjs            # 처음부터 끝까지
//   node scripts/serp-pipeline.mjs --status   # 지금 어디까지 됐는지만 본다
//
// 단계: 순위 수집 → 본문 수집 → 재평가. 각 단계는 스스로 멈출 수 있고(차단·오류),
// 이 감독자가 쉬었다 다시 시킨다. 상태는 `.pipeline-state.json` 에, 로그는
// `.pipeline.log` 에 남으므로 중간에 컴퓨터가 꺼져도 다시 돌리면 이어간다.
//
// **왜 감독자가 따로 필요한가:** 수집기는 403 이 세 번 연속이면 스스로 접는다.
// 그게 옳은 동작이지만, 접힌 채로 사람이 돌아올 때까지 몇 시간이 죽는다.
// 감독자는 그걸 받아 30분 쉬고 다시 시작한다. 사람 없이 이틀을 돌리려면 이 층이 필요하다.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const STATE = './.pipeline-state.json';
const LOG = './.pipeline.log';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  const line = `[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG, line + '\n'); } catch {}
}
const readState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { stage: 'harvest', rounds: {} });
const writeState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2));

// 자식 프로세스를 돌리고 종료 코드와 마지막 출력을 돌려준다.
function run(script, extraArgs = []) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [script, ...extraArgs], { stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const keep = (buf) => {
      const s = buf.toString();
      process.stdout.write(s);
      try { appendFileSync(LOG, s); } catch {}
      tail = (tail + s).slice(-4000);
    };
    p.stdout.on('data', keep);
    p.stderr.on('data', keep);
    p.on('close', (code) => resolve({ code, tail }));
    p.on('error', (e) => resolve({ code: -1, tail: String(e) }));
  });
}

// 남은 일감을 세는 것이 "끝났는가"의 유일한 판단 기준이다.
// 종료 코드로 판단하면 부분 성공을 완료로 오독한다.
async function remaining() {
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const page = async (t, c, mod = (q) => q) => {
    let rows = [], from = 0;
    for (;;) {
      const { data, error } = await mod(db.from(t).select(c)).range(from, from + 999);
      if (error) throw new Error(error.message);
      rows = rows.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    return rows;
  };
  const kws = await page('keywords', 'keyword,is_active');
  const done = new Set((await page('mih_serp_checks', 'query')).map((r) => r.query));
  const queriesLeft = kws.filter((k) => k.is_active !== false && k.keyword && !done.has(`${k.keyword} 섭외`)).length;

  const canonical = (u) => String(u).split('?')[0].replace(/\/$/, '');
  const wanted = new Set();
  for (const c of await page('mih_serp_checks', 'competitors'))
    for (const k of c.competitors ?? []) if (k?.url) wanted.add(canonical(k.url));
  for (const a of await page('articles', 'published_url', (q) => q.not('published_url', 'is', null)))
    wanted.add(canonical(a.published_url));
  const have = new Set((await page('mih_serp_docs', 'url')).map((r) => r.url));
  let docsLeft = 0;
  for (const u of wanted) if (!have.has(u)) docsLeft++;
  return { queriesLeft, docsLeft, docsHave: have.size };
}

if (process.argv.includes('--status')) {
  const s = readState();
  const r = await remaining();
  console.log(JSON.stringify({ 단계: s.stage, ...r, 재시도: s.rounds }, null, 2));
  process.exit(0);
}

log('===== 파이프라인 시작 =====');
let state = readState();

// 막혀 있는지 한 번만 두드려 본다. 막힌 채로 라운드를 시작하면 403 을 세 번 더 맞고
// 그 자체가 차단을 연장한다. 요청 1건으로 판단하고 물러서는 편이 훨씬 싸다.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function blockedNow() {
  try {
    const res = await fetch('https://search.naver.com/search.naver?query=' + encodeURIComponent('아이유 섭외'), {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(12_000),
    });
    return res.status === 403;
  } catch { return true; }
}

// ── 1단계: 순위 수집 ───────────────────────────────────────────────────────
// 차단으로 접히면 쉬었다 다시. 쉬는 시간과 **요청 간격을 둘 다** 늘린다.
//
// ⚠ 간격 escalation 을 상태에 남기는 이유: 수집기의 간격 상향은 그 프로세스 안에서만
// 살아 있다. 감독자가 새로 띄우면 다시 5초로 돌아가 같은 벽에 그대로 부딪힌다.
// (첫 라운드가 정확히 그렇게 0건으로 끝났다.)
//
// 이 컴퓨터가 막혀도 **매일 노출 측정 크론은 안 끊긴다** — 그건 Supabase 에서 걸어
// Vercel 라우트가 요청하므로 IP 가 다르다. 그래서 여기서는 마음 놓고 느리게 가도 된다.
let cooldown = state.cooldownMs ?? 30 * 60_000;
let gap = state.gapMs ?? 5000;
let noProgress = 0;
while (true) {
  const before = await remaining();
  if (before.queriesLeft === 0) { log('순위 수집 완료 — 남은 검색어 0'); break; }

  while (await blockedNow()) {
    gap = Math.min(Math.round(gap * 1.5), 60_000);
    state.gapMs = gap; writeState(state);
    log(`아직 차단 상태 — ${Math.round(cooldown / 60000)}분 더 기다린다 (다음 간격 ${gap}ms)`);
    await sleep(cooldown);
    cooldown = Math.min(Math.round(cooldown * 1.5), 6 * 3600_000);
    state.cooldownMs = cooldown; writeState(state);
  }

  log(`순위 수집 — 남은 검색어 ${before.queriesLeft}개 · 간격 ${gap}ms`);
  state.stage = 'harvest';
  state.rounds.harvest = (state.rounds.harvest ?? 0) + 1;
  writeState(state);

  await run('scripts/serp-harvest.mjs', [`--gap=${gap}`]);

  const after = await remaining();
  const did = before.queriesLeft - after.queriesLeft;
  log(`이번 라운드 검색어 ${did}개 처리 · 남음 ${after.queriesLeft}개`);
  if (after.queriesLeft === 0) { log('순위 수집 완료'); break; }

  if (did <= 0) {
    noProgress++;
    // 진전이 없으면 더 느리게 간다. 같은 속도로 다시 두드리는 것이 가장 나쁘다.
    gap = Math.min(Math.round(gap * 1.5), 60_000);
    if (noProgress >= 6) {
      log('⛔ 여섯 라운드 연속 진전 없음 — 순위 수집을 여기서 멈춘다. 있는 데이터로 다음 단계를 간다.');
      break;
    }
  } else {
    noProgress = 0;
    cooldown = 30 * 60_000;
    gap = Math.max(5000, Math.round(gap * 0.9));   // 잘 되면 아주 조금씩 회복
  }
  state.gapMs = gap; state.cooldownMs = cooldown; writeState(state);

  log(`${Math.round(cooldown / 60000)}분 쉬고 다시 시작한다 (다음 간격 ${gap}ms)`);
  await sleep(cooldown);
  cooldown = Math.min(Math.round(cooldown * 1.5), 6 * 3600_000);
}

// ── 2단계: 본문 수집 ───────────────────────────────────────────────────────
// 검색과 절대 겹치지 않는다 — 같은 IP 요청이 두 배가 되면 차단 위험이 커진다.
cooldown = 20 * 60_000;
noProgress = 0;
while (true) {
  const before = await remaining();
  if (before.docsLeft === 0) { log(`본문 수집 완료 — 확보 ${before.docsHave}건`); break; }
  log(`본문 수집 — 남은 문서 ${before.docsLeft}건 (확보 ${before.docsHave}건)`);
  state.stage = 'corpus';
  state.rounds.corpus = (state.rounds.corpus ?? 0) + 1;
  writeState(state);

  await run('scripts/serp-corpus.mjs');

  const after = await remaining();
  const did = before.docsLeft - after.docsLeft;
  log(`이번 라운드 문서 ${did}건 처리 · 남음 ${after.docsLeft}건`);
  if (after.docsLeft === 0) { log(`본문 수집 완료 — 확보 ${after.docsHave}건`); break; }

  if (did <= 0) {
    noProgress++;
    if (noProgress >= 3) { log('⛔ 세 라운드 연속 진전 없음 — 본문 수집을 여기서 멈춘다.'); break; }
  } else { noProgress = 0; cooldown = 20 * 60_000; }

  log(`${Math.round(cooldown / 60000)}분 쉬고 다시 시작한다`);
  await sleep(cooldown);
  cooldown = Math.min(cooldown * 1.5, 2 * 3600_000);
}

// ── 3단계: 재평가 ─────────────────────────────────────────────────────────
// 임베딩은 새로 계산하지 않는다 — 5만 건이면 CPU 로 며칠이다.
// 먼저 어휘 특징만으로 커진 표본에서 결론이 바뀌는지 본다. 그게 다음 결정의 근거다.
state.stage = 'evaluate';
writeState(state);
log('재평가 — 순위 재현율');
await run('scripts/rank-eval.mjs');
log('재평가 — 학습 실험');
await run('scripts/rank-learn.mjs');

state.stage = 'done';
state.finishedAt = new Date().toISOString();
writeState(state);
const final = await remaining();
log(`===== 파이프라인 종료 — 문서 ${final.docsHave}건 · 남은 검색어 ${final.queriesLeft}개 · 남은 문서 ${final.docsLeft}건 =====`);
log(`전체 기록은 ${LOG} 에 있다.`);
