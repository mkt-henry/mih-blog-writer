/**
 * 원고 HTML 안의 외부 이미지를 원고 이미지 저장소에 올리고 HTML src 를 그 공개 URL 로 교체한다.
 *
 * 저장 위치는 scripts/lib/image-store.mjs 가 env 로 정한다 — R2(R2_* 설정 시) 또는 Supabase 버킷.
 * 올리기 전에 가로 800px·JPEG q80 으로 줄인다. Vercel Blob 은 쓰지 않는다.
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
 * 저장 경로: {slug}/img{N}.jpg
 */

import { readFileSync, writeFileSync } from 'fs';
import { loadEnv, backend, shrink, putImage, publicUrl, supabasePublicUrl } from './lib/image-store.mjs';

loadEnv();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('필요한 환경 변수(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)가 없습니다.');
  process.exit(1);
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

// ── 메인 ────────────────────────────────────────────────────────────────────
const htmlPath   = process.argv[2];
const personName = process.argv[3];

// 슬러그 기본값 계산보다 인자 검증이 먼저다 — 순서가 바뀌면 usage 대신 TypeError가 난다.
if (!htmlPath || !personName) {
  console.error('사용법: node scripts/upload-article-images.js <html-path> <display-name> [storage-slug]');
  process.exit(1);
}

const storageSlug = process.argv[4] || personName.replace(/[^\w-]/g, '-').replace(/-+/g, '-').toLowerCase();

let html = readFileSync(htmlPath, 'utf8');

// 모든 외부 이미지 src 매칭 (이미 이 원고용 저장소 URL인 것만 제외)
// .heic도 포함 (인스타그램 iOS 업로드 이미지). dst-jpg 파라미터로 실제는 JPEG 응답.
const pattern = /src="(https:\/\/[^"]+\.(jpg|jpeg|png|webp|gif|heic)[^"]*)"/gi;
const matches = [...html.matchAll(pattern)];

// 이미 이 슬러그의 저장소 URL(R2 든 Supabase 든)이면 건드리지 않는다.
// Vercel Blob URL은 처리 대상 — 다시 받아 옮긴다.
//
// 번호(img{N})는 필터링 후 순번이 아니라 **본문에서의 원래 등장 순서**를 쓴다.
// 일부만 교체하는 경우 필터 순번을 쓰면 이미 올라간 img1·img2를 덮어써서 사진이 뒤바뀐다.
const settled = [publicUrl(`${storageSlug}/img`), supabasePublicUrl(`${storageSlug}/img`)];
const toProcess = matches
  .map(([, url], i) => ({ url, index: i + 1 }))
  .filter(({ url }) => !settled.some((s) => url.startsWith(s)));

if (toProcess.length === 0) {
  console.log('처리할 이미지가 없습니다. (이미 저장소 공개 URL 사용 중)');
  process.exit(0);
}

console.log(`\n${personName} (slug: ${storageSlug}) — 이미지 ${toProcess.length}개 → ${backend()}\n`);

let replaced = 0;
for (let i = 0; i < toProcess.length; i++) {
  const { url, index } = toProcess[i];
  process.stdout.write(`[${i + 1}/${toProcess.length}] img${index} 다운로드 중...`);
  try {
    const buf = await shrink(await downloadImage(url));
    const serveUrl = await putImage(`${storageSlug}/img${index}.jpg`, buf);
    process.stdout.write(` ✓ ${(buf.length / 1024).toFixed(0)}KB\n`);
    console.log(`    → ${serveUrl}`);

    html = html.replace(url, serveUrl);
    replaced++;
  } catch (e) {
    console.log(` ✗ ${e.message}`);
  }
}

writeFileSync(htmlPath, html, 'utf8');
console.log(`\n완료: ${replaced}/${toProcess.length}개 교체 → ${htmlPath}`);
