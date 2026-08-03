// 에이전시 명함 이미지를 Supabase Storage 버킷에 업로드한다.
//   node scripts/upload-business-card.mjs <agency_slug> <image_path>
// → article-images/agency/<slug>/business-card.<ext> 경로로 업로드하고 public URL을 출력한다.
//
// 이 경로는 lib/agencies.ts 의 businessCardUrl 과 반드시 일치해야 한다.
// (모아보기가 카카오 링크 직전에 이 이미지를 자동 합성한다.)

import { readFileSync } from 'fs';
import { extname } from 'path';

const raw = readFileSync('.env.local', 'utf8');
for (const l of raw.split('\n')) {
  const m = l.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'article-images';

const [slug, imgPath] = process.argv.slice(2);
if (!slug || !imgPath) {
  console.error('사용법: node scripts/upload-business-card.mjs <agency_slug> <image_path>');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('필요한 환경 변수(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)가 없습니다.');
  process.exit(1);
}

const ext = extname(imgPath).toLowerCase() === '.jpeg' ? '.jpg' : extname(imgPath).toLowerCase();
const contentType =
  ext === '.png' ? 'image/png' :
  ext === '.jpg' ? 'image/jpeg' :
  ext === '.webp' ? 'image/webp' : 'application/octet-stream';

const buf = readFileSync(imgPath);
const key = `agency/${slug}/business-card${ext}`;

// JPEG SOF0/SOF2 마커에서 대략적 해상도 출력 (참고용)
function jpegSize(b) {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

if (ext === '.jpg') {
  const sz = jpegSize(buf);
  if (sz) console.log(`[info] 이미지 해상도 ≈ ${sz.w}x${sz.h}px, 용량 ${buf.length}B`);
}

const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': contentType,
    'x-upsert': 'true',
  },
  body: buf,
});
if (!res.ok) {
  console.error(`업로드 실패 — Supabase ${res.status}: ${await res.text()}`);
  process.exit(1);
}

console.log('✓ 업로드 완료');
console.log('  key:', `${BUCKET}/${key}`);
console.log('  url:', `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`);
