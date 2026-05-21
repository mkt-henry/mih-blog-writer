/**
 * output/ 폴더를 스캔해 DB에 없는 원고를 일괄 업로드한다.
 *
 * 사용법:
 *   node scripts/upload-pending.mjs          ← 미업로드 파일 전체 업로드
 *   node scripts/upload-pending.mjs --dry    ← 업로드 없이 목록만 출력
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

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

async function uploadFile(normalizedPath) {
  const parts = normalizedPath.split('/');
  const publishDate = parts[1];
  const agency = parts[2];
  const filename = basename(normalizedPath, '.html');
  const underscoreIdx = filename.indexOf('_');
  const slug = filename.substring(0, underscoreIdx);
  const title = filename.substring(underscoreIdx + 1);
  const htmlContent = readFileSync(normalizedPath, 'utf8');

  // upsert: 충돌(publish_date, agency, slug 복합키) 시 title·html_content·source_path 업데이트
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?on_conflict=publish_date,agency,slug`,
    {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        publish_date: publishDate,
        agency,
        slug,
        person_name: slug,
        title,
        html_content: htmlContent,
        source_path: normalizedPath,
      }),
    }
  );
  if (res.ok) {
    console.log(`  ✓ 업로드: ${title}`);
    return true;
  } else {
    console.error(`  ✗ 실패: ${title}\n    ${await res.text()}`);
    return false;
  }
}

// ─── main ───────────────────────────────────────────────────────────────────

const localFiles = collectHtmlFiles('output');
console.log(`로컬 원고 ${localFiles.length}개 발견`);

const existing = await fetchExistingPaths();
console.log(`DB 등록 원고 ${existing.size}개`);

const pending = localFiles.filter(p => !existing.has(p.replace(/\\/g, '/')));

if (pending.length === 0) {
  console.log('업로드할 원고가 없습니다. 모두 DB에 있습니다.');
  process.exit(0);
}

console.log(`\n미업로드 원고 ${pending.length}개:`);
for (const p of pending) console.log(`  - ${p}`);

if (dryRun) {
  console.log('\n--dry 모드: 실제 업로드는 건너뜁니다.');
  process.exit(0);
}

console.log('\n업로드 시작...');
let ok = 0, fail = 0;
for (const p of pending) {
  const success = await uploadFile(p.replace(/\\/g, '/'));
  success ? ok++ : fail++;
}

console.log(`\n완료: 성공 ${ok}개 / 실패 ${fail}개`);
if (fail > 0) process.exit(1);
