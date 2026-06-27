/**
 * 죽은 Vercel Blob URL(403)을, 동일 경로로 Supabase Storage에 이미 존재하는
 * 이미지 URL로 치환한다. (본문 article-images/{slug}/ 이미지만 대상)
 *
 * 배경: Blob 스토어 비활성화로 모든 blob.vercel-storage.com URL이 403.
 *   발행된 원고(published_at != null)는 migrate-blob-images.mjs(published_at=null 대상)에서
 *   누락되어 html_content가 Blob URL인 채 남았다. 동일 이미지는 Supabase Storage
 *   article-images/{slug}/imgN.jpg 로 존재하므로 호스트만 바꾸면 복구된다.
 *
 * 처리: DB html_content + output 로컬 파일(source_path) 둘 다 치환.
 *   Supabase Storage에 해당 slug 폴더가 없는 경우(인스타핸들 폴더명 불일치 등)는
 *   안전하게 건너뛰고 목록으로 보고한다.
 *
 * 사용법:
 *   node scripts/fix-blob-to-supabase-urls.mjs --dry-run
 *   node scripts/fix-blob-to-supabase-urls.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {}
}
loadEnv();

const U = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const DRY = process.argv.includes('--dry-run');

const BLOB_HOST = 'https://un1nlrbeiyjhkrdj.public.blob.vercel-storage.com/';
const SUPA_PREFIX = `${U}/storage/v1/object/public/`;
const BUCKET = 'article-images';

// 1) Supabase Storage 에 존재하는 slug 폴더 전체 수집
async function fetchFolders() {
  const folders = new Set();
  let offset = 0;
  while (true) {
    const r = await fetch(`${U}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ prefix: '', limit: 1000, offset }),
    });
    const objs = await r.json();
    if (!Array.isArray(objs) || objs.length === 0) break;
    for (const o of objs) folders.add(o.name);
    if (objs.length < 1000) break;
    offset += 1000;
  }
  return folders;
}

// 2) 전체 원고 조회
async function fetchArticles() {
  let rows = [], offset = 0;
  while (true) {
    const r = await fetch(`${U}/rest/v1/articles?select=id,slug,person_name,source_path,html_content&html_content=ilike.*blob.vercel-storage*&limit=500&offset=${offset}`, { headers: h });
    const b = await r.json();
    if (!Array.isArray(b) || b.length === 0) break;
    rows = rows.concat(b);
    if (b.length < 500) break;
    offset += 500;
  }
  return rows;
}

// html 내 article-images Blob URL을, Supabase에 폴더가 있는 slug만 치환.
// 반환: { html, replaced, skippedSlugs }
function rewrite(html, folders) {
  let replaced = 0;
  const skippedSlugs = new Set();
  const re = /https:\/\/un1nlrbeiyjhkrdj\.public\.blob\.vercel-storage\.com\/(article-images\/([^/"'\s)]+)\/[^"'\s)]+)/g;
  const out = html.replace(re, (full, path, slug) => {
    if (folders.has(slug)) { replaced++; return SUPA_PREFIX + path; }
    skippedSlugs.add(slug);
    return full;
  });
  return { html: out, replaced, skippedSlugs };
}

const folders = await fetchFolders();
console.log(`Supabase Storage 폴더(slug): ${folders.size}`);
const articles = await fetchArticles();
console.log(`Blob URL 포함 원고: ${articles.length}`);

let dbChanged = 0, fileChanged = 0, imgFixed = 0, fail = 0;
const skippedAll = new Set();
const skippedArticles = [];

for (const a of articles) {
  const { html, replaced, skippedSlugs } = rewrite(a.html_content, folders);
  for (const s of skippedSlugs) skippedAll.add(s);
  if (skippedSlugs.size > 0) skippedArticles.push(a.person_name);
  if (replaced === 0) continue;
  imgFixed += replaced;
  dbChanged++;

  if (!DRY) {
    // DB 업데이트
    const r = await fetch(`${U}/rest/v1/articles?id=eq.${a.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ html_content: html }) });
    if (!r.ok) { fail++; if (fail <= 3) console.error('DB 실패', a.person_name, await r.text()); continue; }
    // 로컬 output 파일도 동일 치환
    if (a.source_path) {
      const fp = resolve('output', a.source_path);
      if (existsSync(fp)) {
        const local = readFileSync(fp, 'utf8');
        const { html: localFixed, replaced: lr } = rewrite(local, folders);
        if (lr > 0) { writeFileSync(fp, localFixed); fileChanged++; }
      }
    }
  }
}

console.log(`\n${DRY ? '[DRY-RUN] ' : ''}치환 결과`);
console.log(`  복구된 원고(DB): ${dbChanged}`);
console.log(`  복구된 이미지 수: ${imgFixed}`);
if (!DRY) console.log(`  로컬 파일 갱신: ${fileChanged}  / DB 실패: ${fail}`);
console.log(`\n  치환 불가(Supabase에 폴더 없음) slug: ${skippedAll.size}개`);
console.log(`  → ${[...skippedAll].slice(0, 40).join(', ')}`);
console.log(`  영향 원고 예시: ${skippedArticles.slice(0, 20).join(', ')}`);
