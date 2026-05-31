#!/usr/bin/env node
/**
 * DB의 미발행 원고 중 Vercel Blob 이미지가 없는 원고를 일괄 수정한다.
 * Instagram CDN + YouTube 이미지를 Vercel Blob에 업로드하고 DB HTML을 업데이트한다.
 *
 * 사용법: node scripts/fix-blob-images.mjs [slug]
 *   slug 생략 시 이미지 없는 원고 전체 처리
 */

import { loadEnv, requireEnv } from './lib/env.js';
import { supabaseSelect } from './lib/supabase-rest.js';
import { put } from '@vercel/blob';

loadEnv();

const BLOB_STORE = 'un1nlrbeiyjhkrdj.public.blob.vercel-storage.com';
const BUCKET = 'article-images';

// 슬러그 → 스토리지 폴더명 매핑 (한글 slug → 영문 폴더)
const SLUG_MAP = {
  '이적':    'lee-juck',
  '2PM':     '2pm',
  '하이라이트': 'highlight',
  '박효신':  'park-hyoshin',
  '갓세븐':  'got7',
  '아이콘':  'ikon',
  'NCT 127': 'nct-127',
  '씨엔블루': 'cnblue',
};

// 이미지 다운로드
async function downloadImage(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
    Accept: 'image/jpeg,image/png,image/*,*/*',
  };
  // Instagram CDN에는 Referer 필요
  if (url.includes('cdninstagram.com') || url.includes('instagram.com')) {
    headers['Referer'] = 'https://www.instagram.com/';
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const ct = res.headers.get('content-type') || 'image/jpeg';
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: ct };
}

// Vercel Blob 업로드
async function uploadToBlob(storageSlug, index, buffer, contentType) {
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const pathname = `${BUCKET}/${storageSlug}/img${index}.${ext}`;
  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType,
    contentDisposition: 'inline',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: requireEnv('BLOB_READ_WRITE_TOKEN'),
    cacheControlMaxAge: 31536000,
  });
  return blob.url;
}

// Supabase DB HTML 업데이트
async function updateDbHtml(id, html_content) {
  const url = `${requireEnv('SUPABASE_URL')}/rest/v1/articles?id=eq.${id}`;
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ html_content }),
  });
  if (!res.ok) throw new Error(`DB 업데이트 실패: ${res.status} ${await res.text()}`);
}

// 원고 하나 처리
async function processArticle(article) {
  const { id, person_name, agency, slug } = article;
  let html = article.html_content;

  const storageSlug = SLUG_MAP[slug];
  if (!storageSlug) {
    console.log(`⚠ SLUG_MAP에 없음: "${slug}" → 건너뜀 (SLUG_MAP에 추가 필요)`);
    return false;
  }

  console.log(`\n━━━ [${agency}] ${person_name} (${slug} → ${storageSlug}) ━━━`);

  // 처리 대상: Blob이 아닌 이미지 src (.heic 포함 — Instagram iOS 업로드)
  const pattern = /src="(https:\/\/[^"]+\.(jpg|jpeg|png|webp|gif|heic)[^"]*)"/gi;
  const matches = [...html.matchAll(pattern)];
  const toProcess = matches.filter(([, url]) => !url.includes(BLOB_STORE));

  if (toProcess.length === 0) {
    console.log('  처리할 이미지 없음 (이미 Blob 사용 중)');
    return true;
  }

  console.log(`  이미지 ${toProcess.length}개 처리 시작\n`);

  let replaced = 0;
  for (let i = 0; i < toProcess.length; i++) {
    const [, url] = toProcess[i];
    const domain = url.replace(/^https?:\/\//, '').split('/')[0];
    process.stdout.write(`  [${i + 1}/${toProcess.length}] ${domain} ... `);
    try {
      const { buffer, contentType } = await downloadImage(url);
      const blobUrl = await uploadToBlob(storageSlug, i + 1, buffer, contentType);
      html = html.replaceAll(url, blobUrl);
      replaced++;
      console.log(`✓  →  ${blobUrl}`);
    } catch (e) {
      console.log(`✗  ${e.message}`);
    }
  }

  if (replaced > 0) {
    process.stdout.write(`\n  DB 업데이트 중... `);
    await updateDbHtml(id, html);
    console.log('✓');
    console.log(`  완료: ${replaced}/${toProcess.length}개 업로드`);
    return true;
  } else {
    console.log('  모든 이미지 다운로드 실패 — DB 업데이트 건너뜀');
    return false;
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

const targetSlug = process.argv[2] || null;

const articles = await supabaseSelect('articles', {
  columns: 'id,person_name,agency,slug,html_content',
  filter: 'published_at=is.null',
});

const noImage = articles.filter(a => !a.html_content.includes(BLOB_STORE));

const targets = targetSlug
  ? noImage.filter(a => a.slug === targetSlug)
  : noImage;

if (targets.length === 0) {
  console.log(targetSlug
    ? `"${targetSlug}" 원고를 찾을 수 없거나 이미 Blob 이미지 사용 중.`
    : '이미지 없는 원고가 없습니다.');
  process.exit(0);
}

console.log(`처리 대상: ${targets.length}개 원고`);

let ok = 0, fail = 0;
for (const a of targets) {
  const success = await processArticle(a);
  success ? ok++ : fail++;
}

console.log(`\n\n════ 완료: 성공 ${ok}개 / 실패 ${fail}개 ════`);
if (fail > 0) process.exit(1);
