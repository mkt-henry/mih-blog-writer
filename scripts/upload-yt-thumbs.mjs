// 임시 유틸: YouTube 썸네일 → Supabase 업로드
// node scripts/upload-yt-thumbs.mjs <slug> <videoId1> <videoId2> <videoId3> <videoId4>
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch { }
}
loadEnv();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const [,, slug, ...videoIds] = process.argv;
if (!slug || videoIds.length < 1) {
  console.error('usage: node scripts/upload-yt-thumbs.mjs <slug> <v1> <v2> <v3> <v4>');
  process.exit(1);
}

for (let i = 0; i < 4; i++) {
  const vid = videoIds[i] || videoIds[0];
  let url = `https://img.youtube.com/vi/${vid}/maxresdefault.jpg`;
  try {
    let res = await fetch(url);
    if (!res.ok) {
      url = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      res = await fetch(url);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const { error } = await sb.storage.from('article-images').upload(
      `${slug}/img${i+1}.jpg`, buf, { contentType: 'image/jpeg', upsert: true }
    );
    if (error) throw error;
    console.log(`[${i+1}] ✓ https://djtmniygzdbavxwrppxb.supabase.co/storage/v1/object/public/article-images/${slug}/img${i+1}.jpg`);
  } catch(e) {
    console.error(`[${i+1}] ✗`, e.message);
  }
}
