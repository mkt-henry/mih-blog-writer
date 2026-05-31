#!/usr/bin/env node
// 박효신 img3 재시도 — Blob에서 img3가 비어있고 DB에 Instagram CDN URL이 남아있는 경우 수정
import { loadEnv, requireEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';
import { put } from '@vercel/blob';

loadEnv();

const BLOB_STORE = 'un1nlrbeiyjhkrdj.public.blob.vercel-storage.com';
const BUCKET = 'article-images';
const storageSlug = 'park-hyoshin';

const articles = await supabaseSelect('articles', {
  columns: 'id,html_content',
  filter: 'slug=eq.' + encodeURIComponent('박효신') + '&published_at=is.null',
});
if (!articles.length) { console.log('원고 없음'); process.exit(1); }

const { id } = articles[0];
let html = articles[0].html_content;

// 아직 Instagram CDN URL로 남아있는 이미지 찾기
const pattern = /src="(https:\/\/[^"]+\.(jpg|jpeg|png|webp|gif|heic)[^"]*)"/gi;
const matches = [...html.matchAll(pattern)].filter(([, url]) => !url.includes(BLOB_STORE));

if (matches.length === 0) {
  console.log('이미 모든 이미지가 Vercel Blob을 사용 중입니다.');
  process.exit(0);
}

console.log(`남은 Instagram URL: ${matches.length}개\n`);

for (const [, url] of matches) {
  console.log('다운로드 시도:', url.substring(0, 80) + '...');

  // 여러 User-Agent로 시도
  const userAgents = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  ];

  let buf = null;
  let contentType = 'image/jpeg';
  for (const ua of userAgents) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Referer': 'https://www.instagram.com/',
          'Accept': 'image/*,*/*',
        },
      });
      if (res.ok) {
        buf = Buffer.from(await res.arrayBuffer());
        contentType = res.headers.get('content-type') || 'image/jpeg';
        console.log(`  ✓ 성공 (${ua.substring(0, 40)}...)`);
        break;
      } else {
        console.log(`  ✗ HTTP ${res.status} (${ua.substring(0, 40)}...)`);
      }
    } catch (e) {
      console.log(`  ✗ 오류: ${e.message}`);
    }
  }

  if (!buf) {
    console.log('  모든 시도 실패. 건너뜀.\n');
    continue;
  }

  // Vercel Blob에 img3으로 저장
  const pathname = `${BUCKET}/${storageSlug}/img3.jpg`;
  const blob = await put(pathname, buf, {
    access: 'public',
    contentType: 'image/jpeg',
    contentDisposition: 'inline',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: requireEnv('BLOB_READ_WRITE_TOKEN'),
    cacheControlMaxAge: 31536000,
  });
  console.log(`  Blob 업로드: ${blob.url}`);

  html = html.replace(url, blob.url);
}

// DB 업데이트
console.log('\nDB 업데이트 중...');
const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const dbUrl = `${requireEnv('SUPABASE_URL')}/rest/v1/articles?id=eq.${id}`;
const res = await fetch(dbUrl, {
  method: 'PATCH',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  },
  body: JSON.stringify({ html_content: html }),
});
if (!res.ok) {
  console.error('DB 업데이트 실패:', res.status, await res.text());
} else {
  console.log('✓ DB 업데이트 완료');
}
