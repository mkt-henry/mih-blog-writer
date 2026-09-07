/**
 * 로컬 이미지 파일을 원고 이미지 저장소에 업로드한다.
 *
 * 사용법:
 *   node scripts/upload-local-images.mjs <slug> <file1> <file2> ...
 *
 * 예시:
 *   node scripts/upload-local-images.mjs iu C:/Temp/img1.jpg C:/Temp/img2.jpg
 *
 * stdout: 업로드된 공개 URL (줄바꿈 구분)
 *
 * 저장 위치는 scripts/lib/image-store.mjs 가 env 로 정한다 — R2(R2_* 설정 시) 또는 Supabase 버킷.
 * 올리기 전에 가로 800px·JPEG q80 으로 줄인다. Vercel Blob 은 쓰지 않는다.
 */
import { readFileSync } from 'fs';
import { loadEnv, backend, shrink, putImage } from './lib/image-store.mjs';

loadEnv();

const slug = process.argv[2];
const files = process.argv.slice(3);

if (!slug || files.length === 0) {
  console.error('사용법: node scripts/upload-local-images.mjs <slug> <file1> <file2> ...');
  process.exit(1);
}

process.stderr.write(`저장소: ${backend()}\n`);

for (let i = 0; i < files.length; i++) {
  const remoteName = `img${i + 1}.jpg`;
  process.stderr.write(`[${i + 1}/${files.length}] ${remoteName}...`);

  try {
    const buf = await shrink(readFileSync(files[i]));
    const url = await putImage(`${slug}/${remoteName}`, buf);
    process.stderr.write(` ✓ ${(buf.length / 1024).toFixed(0)}KB\n`);
    console.log(url);
  } catch (e) {
    process.stderr.write(` ✗ ${e.message}\n`);
  }
}
