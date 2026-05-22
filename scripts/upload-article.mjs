/**
 * 원고 HTML 파일을 Supabase articles 테이블에 upsert한다.
 *
 * 사용법:
 *   node scripts/upload-article.mjs "output/YYYY-MM-DD/mih_casting/슬러그_제목.html"
 *
 * source_path 기준으로 upsert — 이미 있으면 html_content·title 업데이트, 없으면 신규 삽입.
 */

import { readFileSync } from 'fs';
import { basename } from 'path';

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {}
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('사용법: node scripts/upload-article.mjs <html-path>');
  process.exit(1);
}

const normalizedPath = filePath.replace(/\\/g, '/');
const parts = normalizedPath.split('/');
// 예: output/2026-05-21/mih_casting/규현_[규현 섭외] ....html
const publishDate = parts[1];
const agency     = parts[2];
const filename   = basename(filePath, '.html');

const underscoreIdx = filename.indexOf('_');
const slug      = filename.substring(0, underscoreIdx);
const title     = filename.substring(underscoreIdx + 1);
const htmlContent = readFileSync(filePath, 'utf8');

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// 기존 레코드 확인
const checkRes = await fetch(
  `${SUPABASE_URL}/rest/v1/articles?source_path=eq.${encodeURIComponent(normalizedPath)}&select=id`,
  { headers }
);
const existing = await checkRes.json();

if (existing.length > 0) {
  // 업데이트
  const id = existing[0].id;
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ title, html_content: htmlContent }),
    }
  );
  if (patchRes.ok) {
    console.log(`✓ DB 업데이트 완료: ${title}`);
  } else {
    console.error('✗ 업데이트 실패:', await patchRes.text());
    process.exit(1);
  }
} else {
  // 신규 삽입
  const postRes = await fetch(
    `${SUPABASE_URL}/rest/v1/articles`,
    {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        publish_date: publishDate,
        agency,
        slug,
        person_name: slug,
        title,
        html_content: htmlContent,
        source_path: normalizedPath,
      }),
    }
  );
  if (postRes.ok) {
    const data = await postRes.json();
    console.log(`✓ DB 업로드 완료: ${title}`);
    if (data[0]?.id) console.log(`  id: ${data[0].id}`);
  } else {
    console.error('✗ 업로드 실패:', await postRes.text());
    process.exit(1);
  }
}
