// Vercel Blob 정지 대응: 발행 HTML의 Blob 이미지 URL을 Supabase 공개 URL로 교체한다.
// 사용법: node scripts/_blob-to-supabase.mjs <dir-or-file> ...
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const FROM = 'https://un1nlrbeiyjhkrdj.public.blob.vercel-storage.com/article-images/';
const TO = 'https://djtmniygzdbavxwrppxb.supabase.co/storage/v1/object/public/article-images/';

const targets = process.argv.slice(2);
if (!targets.length) { console.error('사용법: node scripts/_blob-to-supabase.mjs <dir-or-file> ...'); process.exit(1); }

function handleFile(p) {
  if (!p.endsWith('.html')) return;
  let h = readFileSync(p, 'utf8');
  const n = h.split(FROM).length - 1;
  if (n > 0) { writeFileSync(p, h.split(FROM).join(TO), 'utf8'); console.log(`swapped ${n} → ${p}`); }
}

for (const t of targets) {
  if (statSync(t).isDirectory()) {
    for (const f of readdirSync(t)) handleFile(join(t, f));
  } else handleFile(t);
}
