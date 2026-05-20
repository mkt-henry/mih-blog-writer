/**
 * 로컬 이미지 파일을 Vercel Blob에 업로드한다.
 *
 * 사용법:
 *   node scripts/upload-local-images.mjs <slug> <file1> <file2> ...
 *
 * 예시:
 *   node scripts/upload-local-images.mjs iu C:/Temp/img1.jpg C:/Temp/img2.jpg
 *
 * stdout: 업로드된 Vercel Blob URL (줄바꿈 구분)
 */
import { readFileSync } from 'fs';
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

const slug = process.argv[2];
const files = process.argv.slice(3);

if (!slug || files.length === 0) {
  console.error('사용법: node scripts/upload-local-images.mjs <slug> <file1> <file2> ...');
  process.exit(1);
}

// Supabase 버킷 확인
await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
}).catch(() => {});

for (let i = 0; i < files.length; i++) {
  const filePath = files[i];
  const remoteName = `img${i + 1}.jpg`;
  process.stderr.write(`[${i + 1}/${files.length}] ${remoteName}...`);

  try {
    const buf = readFileSync(filePath);

    // Supabase 아카이브
    if (SUPABASE_URL && SUPABASE_KEY) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${slug}/${remoteName}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: buf,
      });
      process.stderr.write(' Supabase ✓');
    }

    // Vercel Blob 업로드
    const blob = await put(`${BUCKET}/${slug}/${remoteName}`, buf, {
      access: 'public',
      contentType: 'image/jpeg',
      contentDisposition: 'inline',
      addRandomSuffix: false,
      allowOverwrite: true,
      token: BLOB_TOKEN,
      cacheControlMaxAge: 31536000,
    });
    process.stderr.write(` Blob ✓\n`);
    console.log(blob.url);
  } catch (e) {
    process.stderr.write(` ✗ ${e.message}\n`);
  }
}
