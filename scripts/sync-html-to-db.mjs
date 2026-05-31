#!/usr/bin/env node
// 로컬 HTML 파일의 html_content를 DB에 반영한다.
// 사용법: node scripts/sync-html-to-db.mjs <html-path>

import { readFileSync } from 'fs';
import { loadEnv, requireEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';

loadEnv();

const [, , htmlPath] = process.argv;
if (!htmlPath) {
  console.error('사용법: node scripts/sync-html-to-db.mjs <html-path>');
  process.exit(1);
}

// output/YYYY-MM-DD/agency/slug_title.html 파싱
const parts = htmlPath.replace(/\\/g, '/').split('/');
const publishDate = parts[1];
const agency = parts[2];
const filename = parts[3].replace(/\.html$/, '');
const slug = filename.substring(0, filename.indexOf('_'));

const html_content = readFileSync(htmlPath, 'utf8');

// DB에서 해당 원고 확인
const existing = await supabaseSelect('articles', {
  columns: 'id,person_name',
  filter: `publish_date=eq.${publishDate}&agency=eq.${agency}&slug=eq.${encodeURIComponent(slug)}`,
});

if (!existing.length) {
  console.error(`DB에 원고 없음: ${publishDate}/${agency}/${slug}`);
  process.exit(1);
}

const { id, person_name } = existing[0];
console.log(`업데이트: [${agency}] ${person_name} (${publishDate})`);

const url = `${requireEnv('SUPABASE_URL')}/rest/v1/articles?id=eq.${id}`;
const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const res = await fetch(url, {
  method: 'PATCH',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  },
  body: JSON.stringify({ html_content }),
});

if (!res.ok) {
  console.error(`실패: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log('✓ DB 업데이트 완료');
