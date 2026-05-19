// Bugs CDN 이미지를 Vercel Blob으로 업로드하고 HTML src를 교체하는 임시 스크립트
import { readFileSync, writeFileSync } from 'fs';
import { put } from '@vercel/blob';

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch { }
}
loadEnv();

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'article-images';

const htmlPath = process.argv[2];
const slug = process.argv[3];

if (!htmlPath || !slug) { console.error('사용법: node scripts/upload-bugs-images.mjs <html-path> <slug>'); process.exit(1); }

let html = readFileSync(htmlPath, 'utf8');

// image.bugsm.co.kr URL 추출
const pattern = /src="(https:\/\/image\.bugsm\.co\.kr\/[^"]+)"/g;
const matches = [...html.matchAll(pattern)];

if (matches.length === 0) { console.log('처리할 Bugs 이미지가 없습니다.'); process.exit(0); }
console.log(`이미지 ${matches.length}개 발견\n`);

// Supabase 버킷 확인
await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
});

for (let i = 0; i < matches.length; i++) {
  const url = matches[i][1];
  process.stdout.write(`[${i+1}/${matches.length}] ${url.split('/').slice(-1)[0]}...`);

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' } });
  if (!res.ok) { console.log(` HTTP ${res.status} 실패`); continue; }
  const buf = Buffer.from(await res.arrayBuffer());

  // Supabase 아카이브
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${slug}/img${i+1}.jpg`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: buf,
  });
  process.stdout.write(' Supabase ✓');

  // Vercel Blob 업로드
  const blob = await put(`${BUCKET}/${slug}/img${i+1}.jpg`, buf, {
    access: 'public', contentType: 'image/jpeg', contentDisposition: 'inline',
    addRandomSuffix: false, allowOverwrite: true, token: BLOB_TOKEN, cacheControlMaxAge: 31536000,
  });
  process.stdout.write(` Blob ✓ → ${blob.url}\n`);

  html = html.replace(url, blob.url);
}

writeFileSync(htmlPath, html, 'utf8');
console.log('\nHTML src 교체 완료');
