// 에이전시 명함 이미지를 Vercel Blob에 업로드한다.
//   node scripts/upload-business-card.mjs <agency_slug> <image_path>
// → agency/<slug>/business-card.<ext> 경로로 업로드하고 public URL을 출력한다.
// .env.local 의 BLOB_READ_WRITE_TOKEN 사용 (기존 bulk-upload-images.mjs 와 동일 방식).

import { put } from '@vercel/blob';
import { readFileSync } from 'fs';
import { extname } from 'path';

const raw = readFileSync('.env.local', 'utf8');
for (const l of raw.split('\n')) {
  const m = l.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const [slug, imgPath] = process.argv.slice(2);
if (!slug || !imgPath) {
  console.error('사용법: node scripts/upload-business-card.mjs <agency_slug> <image_path>');
  process.exit(1);
}

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error('BLOB_READ_WRITE_TOKEN 미설정');

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

const res = await put(key, buf, {
  access: 'public',
  contentType,
  contentDisposition: 'inline',
  addRandomSuffix: false,
  allowOverwrite: true,
  token,
  cacheControlMaxAge: 31536000,
});

console.log('✓ 업로드 완료');
console.log('  key:', key);
console.log('  url:', res.url);
