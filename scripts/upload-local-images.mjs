/**
 * 로컬 이미지 파일을 Supabase Storage 버킷에 업로드한다.
 *
 * 사용법:
 *   node scripts/upload-local-images.mjs <slug> <file1> <file2> ...
 *
 * 예시:
 *   node scripts/upload-local-images.mjs iu C:/Temp/img1.jpg C:/Temp/img2.jpg
 *
 * stdout: 업로드된 Supabase 공개 URL (줄바꿈 구분)
 *
 * 원고 본문에 넣는 이미지 URL은 Supabase 버킷 공개 URL을 쓴다 — Vercel Blob은 쓰지 않는다.
 */
import { readFileSync } from 'fs';

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

    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${slug}/${remoteName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: buf,
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);

    process.stderr.write(' Supabase ✓\n');
    console.log(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${slug}/${remoteName}`);
  } catch (e) {
    process.stderr.write(` ✗ ${e.message}\n`);
  }
}
