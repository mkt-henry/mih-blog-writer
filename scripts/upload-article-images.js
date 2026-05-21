/**
 * 원고 HTML 안의 외부 이미지를 Supabase(아카이브) + Vercel Blob(서빙)에 동시 업로드하고
 * HTML src를 Vercel Blob 공개 URL로 교체한다.
 *
 * 사용법:
 *   node scripts/upload-article-images.js <html-path> <display-name> [storage-slug]
 *
 * 예시:
 *   node scripts/upload-article-images.js \
 *     "output/2026-05-09/mih_speaker/유현준_[...].html" \
 *     유현준 yoo-hyunjoon
 *
 * 처리 대상 src: Instagram CDN / Supabase / Vercel Blob(랜덤 접미사 포함) URL
 * 저장 경로: article-images/{slug}/img{N}.jpg
 */

import { readFileSync, writeFileSync } from 'fs';
import { put } from '@vercel/blob';

// ── 환경 변수 로드 (.env.local) ─────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch { /* .env.local 없으면 환경 변수 그대로 사용 */ }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BLOB_TOKEN   = process.env.BLOB_READ_WRITE_TOKEN;
const BUCKET       = 'article-images';

if (!SUPABASE_URL || !SUPABASE_KEY || !BLOB_TOKEN) {
  console.error('필요한 환경 변수(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / BLOB_READ_WRITE_TOKEN)가 없습니다.');
  process.exit(1);
}

// ── Supabase 버킷 확인 (없으면 생성) ────────────────────────────────────────
async function ensureSupabaseBucket() {
  await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  // 409 = 이미 존재 → 정상
}

// ── 이미지 다운로드 ──────────────────────────────────────────────────────────
async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://www.instagram.com/',
      Accept: 'image/jpeg,image/png,image/*',
    },
  });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Supabase Storage 업로드 (아카이브) ──────────────────────────────────────
async function uploadToSupabase(slug, index, buffer) {
  const path = `${slug}/img${index}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }
}

// ── Vercel Blob 업로드 (서빙) ────────────────────────────────────────────────
async function uploadToBlob(slug, index, buffer) {
  const pathname = `${BUCKET}/${slug}/img${index}.jpg`;
  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType: 'image/jpeg',
    contentDisposition: 'inline',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: BLOB_TOKEN,
    cacheControlMaxAge: 31536000,
  });
  return blob.url;
}

// ── 메인 ────────────────────────────────────────────────────────────────────
const htmlPath    = process.argv[2];
const personName  = process.argv[3];
const storageSlug = process.argv[4] || personName.replace(/[^\w-]/g, '-').replace(/-+/g, '-').toLowerCase();

if (!htmlPath || !personName) {
  console.error('사용법: node scripts/upload-article-images.js <html-path> <display-name> [storage-slug]');
  process.exit(1);
}

let html = readFileSync(htmlPath, 'utf8');

// 모든 외부 이미지 src 매칭 (이미 깔끔한 Vercel Blob URL만 제외)
const BLOB_STORE = 'un1nlrbeiyjhkrdj.public.blob.vercel-storage.com';
// .heic도 포함 (인스타그램 iOS 업로드 이미지). dst-jpg 파라미터로 실제는 JPEG 응답.
const pattern = /src="(https:\/\/[^"]+\.(jpg|jpeg|png|webp|gif|heic)[^"]*)"/gi;
const matches = [...html.matchAll(pattern)];

// 이미 깔끔한 Vercel Blob 경로(랜덤 접미사 없음)는 제외
const toProcess = matches.filter(([, url]) => {
  if (!url.includes(BLOB_STORE)) return true;          // 비-Blob URL은 항상 처리
  const clean = `${BUCKET}/${storageSlug}/img`;
  return !url.includes(clean) || /img\d+-\w{10,}\.jpg/.test(url); // 랜덤 접미사 있으면 처리
});

if (toProcess.length === 0) {
  console.log('처리할 이미지가 없습니다. (이미 깔끔한 Vercel Blob URL 사용 중)');
  process.exit(0);
}

console.log(`\n${personName} (slug: ${storageSlug}) — 이미지 ${toProcess.length}개\n`);
console.log('  📦 Supabase  → 아카이브 보관');
console.log('  🌐 Vercel Blob → Naver 서빙\n');

await ensureSupabaseBucket();

let replaced = 0;
for (let i = 0; i < toProcess.length; i++) {
  const [, url] = toProcess[i];
  process.stdout.write(`[${i + 1}/${toProcess.length}] 다운로드 중...`);
  try {
    const buf = await downloadImage(url);

    // Supabase 업로드 (아카이브)
    await uploadToSupabase(storageSlug, i + 1, buf);
    process.stdout.write(' Supabase ✓');

    // Vercel Blob 업로드 (서빙)
    const blobUrl = await uploadToBlob(storageSlug, i + 1, buf);
    process.stdout.write(' · Blob ✓\n');
    console.log(`    → ${blobUrl}`);

    html = html.replace(url, blobUrl);
    replaced++;
  } catch (e) {
    console.log(` ✗ ${e.message}`);
  }
}

writeFileSync(htmlPath, html, 'utf8');
console.log(`\n완료: ${replaced}/${toProcess.length}개 교체 → ${htmlPath}`);
