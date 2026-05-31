#!/usr/bin/env node
// 발행 대기 원고 중 Vercel Blob 이미지가 없는 원고 목록 출력

import { loadEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';

loadEnv();

const BLOB_STORE = 'un1nlrbeiyjhkrdj.public.blob.vercel-storage.com';

const articles = await supabaseSelect('articles', {
  columns: 'id,person_name,agency,slug,instagram_url,html_content',
  filter: 'published_at=is.null',
});

console.log(`발행 대기 원고: ${articles.length}개\n`);

const noImage = articles.filter((a) => !a.html_content.includes(BLOB_STORE));

if (noImage.length === 0) {
  console.log('이미지 없는 원고 없음. 모두 정상.');
} else {
  console.log(`이미지 없는 원고: ${noImage.length}개\n`);
  for (const a of noImage) {
    const hasAnyImg = /<img/i.test(a.html_content);
    console.log(`[${a.agency}] ${a.person_name} (slug: ${a.slug})`);
    console.log(`  instagram_url: ${a.instagram_url ?? '없음'}`);
    console.log(`  <img> 태그: ${hasAnyImg ? '있음 (외부 URL)' : '없음'}`);
  }
}
