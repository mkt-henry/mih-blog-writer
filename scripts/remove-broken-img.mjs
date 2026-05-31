#!/usr/bin/env node
// Vercel Blob이 아닌 img 태그를 HTML에서 제거하고 DB 업데이트
import { loadEnv, requireEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';

loadEnv();

const BLOB_STORE = 'un1nlrbeiyjhkrdj.public.blob.vercel-storage.com';

const [, , slug] = process.argv;
if (!slug) { console.error('사용법: node scripts/remove-broken-img.mjs <slug>'); process.exit(1); }

const articles = await supabaseSelect('articles', {
  columns: 'id,person_name,html_content',
  filter: `slug=eq.${encodeURIComponent(slug)}&published_at=is.null`,
});
if (!articles.length) { console.log('원고 없음'); process.exit(1); }

const { id, person_name } = articles[0];
let html = articles[0].html_content;

// Blob이 아닌 img 태그를 포함하는 <p align="center"><img ...></p> 제거
const imgPattern = /<p align="center"><img src="(https?:\/\/[^"]+)"/gi;
let match;
let removed = 0;

const blobImgs = [];
const brokenImgs = [];
for (const [, url] of html.matchAll(imgPattern)) {
  if (url.includes(BLOB_STORE)) blobImgs.push(url);
  else brokenImgs.push(url);
}

console.log(`[${person_name}] Blob 이미지: ${blobImgs.length}개, 깨진 이미지: ${brokenImgs.length}개`);

for (const url of brokenImgs) {
  // <p align="center"><img src="URL" ...></p> 패턴 제거
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagPattern = new RegExp(`<p align="center"><img src="${escaped}"[^>]*><\\/p>\\n?`, 'g');
  const before = html.length;
  html = html.replace(tagPattern, '');
  if (html.length < before) {
    console.log(`  제거: ${url.substring(0, 70)}...`);
    removed++;
  } else {
    console.log(`  제거 실패: ${url.substring(0, 70)}...`);
  }
}

if (removed === 0) {
  console.log('제거된 이미지 없음.');
  process.exit(0);
}

// DB 업데이트
const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const dbUrl = `${requireEnv('SUPABASE_URL')}/rest/v1/articles?id=eq.${id}`;
const res = await fetch(dbUrl, {
  method: 'PATCH',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  },
  body: JSON.stringify({ html_content: html }),
});
if (!res.ok) {
  console.error('DB 업데이트 실패:', res.status, await res.text());
} else {
  console.log(`\n✓ DB 업데이트 완료 (${removed}개 이미지 제거)`);
}
