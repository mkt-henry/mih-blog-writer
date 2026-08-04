#!/usr/bin/env node
// 재작성한 원고를 DB에 반영하고 rewrite-done.json 에 완료 표시한다.
//   node scripts/mark-rewrite-done.mjs "output/.../a.html" "output/.../b.html"
//
// sync-html-to-db.mjs 와 달리 완료 목록까지 갱신해, 다음 배치 추출에서
// 같은 원고가 다시 뽑히지 않도록 한다.

import { readFileSync, writeFileSync } from 'fs';
import { loadEnv, requireEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';

loadEnv();

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('사용법: node scripts/mark-rewrite-done.mjs <html-path> [...]');
  process.exit(1);
}

const DONE_FILE = new URL('../output/diag/rewrite-done.json', import.meta.url);
let done = [];
try {
  done = JSON.parse(readFileSync(DONE_FILE, 'utf8'));
} catch {
  /* 첫 실행 */
}
const doneSet = new Set(done);

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

let failed = 0;

for (const raw of paths) {
  const p = raw.replace(/\\/g, '/');
  const parts = p.split('/');
  const publishDate = parts[1];
  const agency = parts[2];
  const filename = parts[3].replace(/\.html$/, '');
  const slug = filename.substring(0, filename.indexOf('_'));

  const rows = await supabaseSelect('articles', {
    columns: 'id,person_name',
    filter: `publish_date=eq.${publishDate}&agency=eq.${agency}&slug=eq.${encodeURIComponent(slug)}`,
  });

  if (!rows.length) {
    console.error(`✗ DB에 원고 없음: ${publishDate}/${agency}/${slug}`);
    failed++;
    continue;
  }

  const { id, person_name } = rows[0];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ html_content: readFileSync(p, 'utf8') }),
  });

  if (!res.ok) {
    console.error(`✗ 업데이트 실패 ${person_name}: ${res.status} ${await res.text()}`);
    failed++;
    continue;
  }

  doneSet.add(id);
  console.log(`✓ ${person_name} (${agency} / ${publishDate}) DB 반영 + 완료 표시`);
}

writeFileSync(DONE_FILE, JSON.stringify([...doneSet], null, 2), 'utf8');
console.log(`\n완료 목록 ${doneSet.size}건`);
if (failed) process.exit(1);
