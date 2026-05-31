#!/usr/bin/env node
import { loadEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';

loadEnv();

const BLOB_STORE = 'un1nlrbeiyjhkrdj.public.blob.vercel-storage.com';

const articles = await supabaseSelect('articles', {
  columns: 'id,person_name,agency,slug,html_content',
  filter: 'published_at=is.null',
});

const noImage = articles.filter(a => !a.html_content.includes(BLOB_STORE));
const now = Math.floor(Date.now() / 1000);

console.log(`이미지 없는 원고: ${noImage.length}개\n`);

for (const a of noImage) {
  const imgs = [...a.html_content.matchAll(/src="(https:\/\/[^"]+)"/gi)].map(m => m[1]);
  const oes = imgs.map(url => {
    const m = url.match(/oe=([0-9A-Fa-f]+)/);
    return m ? parseInt(m[1], 16) : null;
  }).filter(Boolean);

  const minOe = oes.length ? Math.min(...oes) : null;
  const hoursLeft = minOe ? Math.round((minOe - now) / 3600) : null;
  const expireDate = minOe ? new Date(minOe * 1000).toISOString().slice(0, 10) : '알수없음';

  console.log(`[${a.agency}] ${a.person_name} (slug: ${a.slug})`);
  console.log(`  이미지: ${imgs.length}개  만료: ${expireDate}  남은시간: ${hoursLeft != null ? hoursLeft + 'h' : '?'}`);
  for (const url of imgs) {
    const domain = url.replace(/^https?:\/\//, '').split('/')[0];
    console.log(`  → ${domain}`);
  }
  console.log();
}
