// 마이그레이션 SQL 파일을 Supabase Management API로 적용한다.
//   node scripts/apply-migration.mjs <path-to-sql>
// .env.local 의 SUPABASE_ACCESS_TOKEN(개인 액세스 토큰) + SUPABASE_URL(프로젝트 ref) 사용.

import { readFileSync } from 'fs';

const raw = readFileSync('.env.local', 'utf8');
for (const l of raw.split('\n')) {
  const m = l.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('사용법: node scripts/apply-migration.mjs <path-to-sql>');
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.SUPABASE_URL;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN 미설정');
if (!url) throw new Error('SUPABASE_URL 미설정');

const ref = new URL(url).hostname.split('.')[0];
const sql = readFileSync(sqlPath, 'utf8');

console.log(`[apply-migration] ref=${ref} file=${sqlPath}`);

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`✗ ${res.status} ${res.statusText}`);
  console.error(text);
  process.exit(1);
}
console.log('✓ 적용 완료');
console.log(text || '(빈 응답)');
