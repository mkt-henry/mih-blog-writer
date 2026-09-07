/**
 * 이미 올라간 원고 이미지를 같은 경로에 더 작게 덮어쓴다 (Supabase `article-images`).
 *
 * 발행된 네이버 글 1,200여 편이 Supabase URL 을 그대로 가리키고 있어 호스트는 못 바꾸지만,
 * 같은 경로의 파일을 줄이면 방문당 전송량이 그만큼 준다. 표본 측정: 800px·q80 에서 약 55% 절감.
 *
 * 사용법:
 *   npm run recompress:images -- --dry-run --limit 20   ← 20장만 받아서 절감량만 계산 (덮어쓰기 없음)
 *   npm run recompress:images                           ← 전체 처리
 *   npm run recompress:images -- --only lee-boram       ← 한 폴더만
 *   npm run recompress:images -- --include-cards        ← 명함(agency/) 도 포함 (기본 제외)
 *
 * 처리한 파일은 output/.recompress-ledger.json 에 기록돼 재실행 시 건너뛴다 (재다운로드 = 전송량 낭비).
 * 새 파일이 원본의 90% 미만일 때만 덮어쓴다.
 *
 * ⚠ 저장소가 402(전송량 한도 초과)로 막혀 있으면 아무것도 못 한다 — 플랜 복구 뒤 실행.
 *    전체 처리는 원본 812MB 를 한 번 내려받으므로 그만큼 전송량을 쓴다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { loadEnv, listSupabase, getSupabase, putSupabase, shrink } from './lib/image-store.mjs';

loadEnv();

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt  = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };

const DRY          = flag('dry-run');
const LIMIT        = Number(opt('limit', 0));
const ONLY         = opt('only', '');
const INCLUDE_CARDS = flag('include-cards');
const WIDTH        = Number(opt('width', 800));
const QUALITY      = Number(opt('quality', 80));
const CONCURRENCY  = Number(opt('concurrency', 4));
const LEDGER       = 'output/.recompress-ledger.json';
const BACKUP_DIR   = 'output/.image-originals';

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
const saveLedger = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));

// ── 대상 수집 ────────────────────────────────────────────────────────────────
// process.exit() 는 쓰지 않는다 — Windows·Node 24 에서 fetch 직후 exit 하면 libuv 단정으로 죽는다.
let folders;
try {
  folders = ONLY ? [ONLY] : (await listSupabase('')).filter((e) => e.id === null).map((e) => e.name);
} catch (e) {
  if (!/402/.test(e.message)) throw e;
  console.error('Supabase 저장소가 전송량 한도 초과(402)로 막혀 있다. 플랜 복구 뒤 다시 실행.');
  process.exitCode = 2;
  folders = [];
}
if (!INCLUDE_CARDS) folders = folders.filter((f) => f !== 'agency');

const paths = [];
for (const folder of folders) {
  const files = await listSupabase(folder);
  for (const f of files) if (f.id !== null) paths.push(`${folder}/${f.name}`);
}
let todo = paths.filter((p) => !ledger[p]);
if (LIMIT > 0) todo = todo.slice(0, LIMIT);
console.log(`폴더 ${folders.length} · 파일 ${paths.length} · 이미 처리 ${paths.length - paths.filter((p) => !ledger[p]).length} · 이번 대상 ${todo.length}${DRY ? ' (dry-run)' : ''}`);

// ── 처리 ─────────────────────────────────────────────────────────────────────
let before = 0, after = 0, done = 0, kept = 0, failed = 0;

async function one(path) {
  try {
    const src = await getSupabase(path);
    const out = await shrink(src, { width: WIDTH, quality: QUALITY });
    const smaller = out.length < src.length * 0.9;
    before += src.length;
    after  += smaller ? out.length : src.length;
    if (smaller && !DRY) {
      // 덮어쓰기는 되돌릴 수 없으니 원본을 로컬에 남긴다 (output/.image-originals/, git 제외)
      mkdirSync(dirname(`${BACKUP_DIR}/${path}`), { recursive: true });
      writeFileSync(`${BACKUP_DIR}/${path}`, src);
      await putSupabase(path, out);
    }
    if (!DRY) { ledger[path] = { before: src.length, after: smaller ? out.length : src.length, at: new Date().toISOString() }; saveLedger(); }
    smaller ? done++ : kept++;
    console.log(`${smaller ? (DRY ? '·' : '✓') : '='} ${path}  ${(src.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB`);
  } catch (e) {
    failed++;
    console.log(`✗ ${path}  ${e.message}`);
  }
}

// ponytail: 단순 워커 풀. 큐 하나를 N 개가 같이 비운다.
const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) await one(queue.shift());
}));

const mb = (n) => (n / 1048576).toFixed(1);
console.log(`\n${DRY ? '예상' : '결과'}: ${mb(before)}MB → ${mb(after)}MB (${before ? (100 - 100 * after / before).toFixed(0) : 0}% 절감) · 덮어씀 ${done} · 유지 ${kept} · 실패 ${failed}`);
