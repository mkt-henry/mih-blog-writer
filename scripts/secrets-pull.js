/**
 * Supabase app_settings → .env.local 생성
 *
 * 새 컴퓨터 초기 설정:
 *   1. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 환경변수로 설정
 *   2. node scripts/secrets-pull.js
 *   → .env.local 자동 생성
 *
 * 사용법: node scripts/secrets-pull.js
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '환경변수가 없습니다.\n' +
    '  Windows PowerShell:\n' +
    '    $env:SUPABASE_URL="https://djtmniygzdbavxwrppxb.supabase.co"\n' +
    '    $env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"\n' +
    '    node scripts/secrets-pull.js'
  );
  process.exit(1);
}

console.log('Supabase app_settings 에서 비밀값 다운로드 중...');

const res = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?select=key,value`, {
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  },
});

if (!res.ok) {
  console.error(`조회 실패: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const rows = await res.json();
if (!rows.length) {
  console.warn('app_settings 테이블이 비어 있습니다. secrets-push.js 를 먼저 실행하세요.');
  process.exit(1);
}

// 기존 .env.local 파싱 (SUPABASE_* 행은 보존)
const existing = {};
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.+)$/);
    if (m) existing[m[1].trim()] = m[2].trim();
  }
}

// DB 값으로 덮어쓰기
for (const { key, value } of rows) {
  existing[key] = value;
  console.log(`  ✓  ${key}`);
}

// SUPABASE_* 는 현재 환경변수로도 포함
existing['SUPABASE_URL'] = SUPABASE_URL;
existing['SUPABASE_SERVICE_ROLE_KEY'] = SUPABASE_KEY;

const lines = Object.entries(existing)
  .map(([k, v]) => `${k}=${v}`)
  .join('\n');

writeFileSync('.env.local', lines + '\n', 'utf8');
console.log('.env.local 생성 완료.');
