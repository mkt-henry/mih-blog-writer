/**
 * .env.local → Supabase app_settings 테이블로 비밀값 업로드
 *
 * 사용법: node scripts/secrets-push.js
 *
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 .env.local 또는 환경변수로 지정.
 * 저장 대상 키: APIFY_TOKEN, BLOB_READ_WRITE_TOKEN
 * (SUPABASE_* 는 게이트키퍼이므로 DB에 저장하지 않는다)
 */

import { readFileSync } from 'fs';

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch { /* 없으면 환경변수 그대로 */ }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.');
  process.exit(1);
}

// DB에 저장할 키 목록 (설명 포함)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 게이트키퍼이므로 제외
const SECRETS = [
  { key: 'APIFY_TOKEN',           description: 'Apify API 토큰 (Instagram 이미지 수집)' },
  { key: 'BLOB_READ_WRITE_TOKEN',  description: 'Vercel Blob 읽기/쓰기 토큰 (이미지 서빙)' },
  { key: 'SUPABASE_ACCESS_TOKEN',  description: 'Supabase personal access token (DB 마이그레이션용)' },
];

async function upsert(key, value, description) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_settings`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ key, value, description, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`upsert 실패 [${key}]: ${res.status} ${txt}`);
  }
}

console.log('Supabase app_settings 업로드 시작...');
for (const { key, description } of SECRETS) {
  const value = process.env[key];
  if (!value) {
    console.warn(`  ⚠  ${key} 환경변수 없음 — 건너뜀`);
    continue;
  }
  await upsert(key, value, description);
  console.log(`  ✓  ${key} 저장 완료`);
}
console.log('완료.');
