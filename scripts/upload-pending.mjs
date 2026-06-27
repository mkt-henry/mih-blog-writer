/**
 * output/ 폴더를 스캔해 DB에 없는 원고를 일괄 업로드한다.
 *
 * 사용법:
 *   node scripts/upload-pending.mjs          ← 미업로드 파일 전체 업로드
 *   node scripts/upload-pending.mjs --dry    ← 업로드 없이 목록만 출력
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parseArticlePath } from './lib/parse-article-path.js';

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {}
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry');

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// output/ 에서 원고 HTML 파일 목록 수집
// 구조: output/YYYY-MM-DD/{agency}/파일.html
function collectHtmlFiles(dir) {
  const results = [];
  for (const dateEntry of readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEntry)) continue;
    const datePath = join(dir, dateEntry);
    if (!statSync(datePath).isDirectory()) continue;
    for (const agencyEntry of readdirSync(datePath)) {
      const agencyPath = join(datePath, agencyEntry);
      if (!statSync(agencyPath).isDirectory()) continue;
      for (const file of readdirSync(agencyPath)) {
        if (!file.endsWith('.html')) continue;
        results.push(`output/${dateEntry}/${agencyEntry}/${file}`);
      }
    }
  }
  return results;
}

// DB에 이미 있는 source_path 전체 조회
async function fetchExistingPaths() {
  let paths = new Set();
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/articles?select=source_path&limit=${limit}&offset=${offset}`,
      { headers }
    );
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) paths.add(r.source_path);
    if (rows.length < limit) break;
    offset += limit;
  }
  return paths;
}

// localPath: 파일 읽기용(output/ 포함), parsed: parseArticlePath 결과(표준 source_path)
async function uploadFile(localPath, parsed) {
  const htmlContent = readFileSync(localPath, 'utf8');

  // upsert: 충돌(publish_date, agency, slug 복합키) 시 title·html_content·source_path 업데이트
  // source_path는 publish-article.js와 동일한 표준 형식({date}/{agency}/{file}, output/ 접두사 없음)으로 저장
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?on_conflict=publish_date,agency,slug`,
    {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        publish_date: parsed.publishDate,
        agency: parsed.agency,
        slug: parsed.slug,
        person_name: parsed.personName,
        title: parsed.title,
        html_content: htmlContent,
        source_path: parsed.sourcePath,
      }),
    }
  );
  if (res.ok) {
    console.log(`  ✓ 업로드: ${parsed.title}`);
    return true;
  } else {
    console.error(`  ✗ 실패: ${parsed.title}\n    ${await res.text()}`);
    return false;
  }
}

// ─── main ───────────────────────────────────────────────────────────────────

const localFiles = collectHtmlFiles('output');
console.log(`로컬 원고 ${localFiles.length}개 발견`);

// 각 로컬 파일을 표준 경로로 파싱. 파싱 실패(파일명 규칙 위반) 파일은 경고 후 제외.
const parsedFiles = [];
for (const p of localFiles) {
  const normalized = p.replace(/\\/g, '/');
  const parsed = parseArticlePath(normalized);
  if (!parsed) {
    console.warn(`  ⚠️  경로 파싱 실패(건너뜀): ${p}`);
    continue;
  }
  parsedFiles.push({ localPath: normalized, parsed });
}

const existing = await fetchExistingPaths();
console.log(`DB 등록 원고 ${existing.size}개`);

// 매칭은 표준 source_path({date}/{agency}/{file}) 기준 — DB 저장 형식과 일치
const pending = parsedFiles.filter(x => !existing.has(x.parsed.sourcePath));

if (pending.length === 0) {
  console.log('업로드할 원고가 없습니다. 모두 DB에 있습니다.');
  process.exit(0);
}

console.log(`\n미업로드 원고 ${pending.length}개:`);
for (const x of pending) console.log(`  - ${x.parsed.sourcePath}`);

if (dryRun) {
  console.log('\n--dry 모드: 실제 업로드는 건너뜁니다.');
  process.exit(0);
}

console.log('\n업로드 시작...');
let ok = 0, fail = 0;
for (const x of pending) {
  const success = await uploadFile(x.localPath, x.parsed);
  success ? ok++ : fail++;
}

console.log(`\n완료: 성공 ${ok}개 / 실패 ${fail}개`);
if (fail > 0) process.exit(1);
