/**
 * Blob URL 이미지를 Supabase Storage로 마이그레이션
 *
 * 처리 대상: published_at=null + html_content에 blob.vercel-storage URL 포함 원고
 * 처리 방법:
 *   1. DB에서 instagram_url이 있는 원고 조회
 *   2. 각 원고의 인스타 핸들로 Apify 재수집
 *   3. 수집 즉시 이미지 다운로드 → Supabase 업로드
 *   4. source_path → output 파일 src 교체
 *   5. DB html_content 업데이트
 *
 * 사용법:
 *   node scripts/migrate-blob-images.mjs
 *   node scripts/migrate-blob-images.mjs --dry-run    # DB 조회만, 실제 처리 안 함
 *   node scripts/migrate-blob-images.mjs --limit 5   # 최대 5개만 처리
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {}
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'article-images';

// ── CLI 인수 파싱 ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) || 10 : Infinity;
const startIdx = args.indexOf('--start');
const START = startIdx >= 0 ? parseInt(args[startIdx + 1]) || 0 : 0;

// ── APIFY_TOKEN 로드 ───────────────────────────────────────────────────────
async function ensureApifyToken() {
  if (process.env.APIFY_TOKEN) return;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/app_settings?key=eq.APIFY_TOKEN&select=value`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  if (!rows?.[0]?.value) throw new Error('APIFY_TOKEN 없음');
  process.env.APIFY_TOKEN = rows[0].value;
}

// ── Apify Actor 실행 ───────────────────────────────────────────────────────
async function runActor(username) {
  const token = process.env.APIFY_TOKEN;
  const input = { usernames: [username], resultsLimit: 12, resultsType: 'posts' };

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs?token=${token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  );
  if (!runRes.ok) throw new Error(`Actor 실행 실패: ${await runRes.text()}`);
  const { data: { id: runId } } = await runRes.json();

  for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const { data: s } = await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`)).json();
    if (s.status === 'SUCCEEDED') break;
    if (s.status === 'FAILED' || s.status === 'ABORTED') throw new Error(`Actor 실패: ${s.status}`);
    process.stdout.write('.');
  }

  const ds = await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}&limit=20`)).json();
  return ds;
}

function extractUrls(profiles, limit = 6) {
  const urls = [];
  for (const profile of profiles) {
    for (const post of profile.latestPosts ?? []) {
      if (urls.length >= limit) break;
      if (post.type === 'Video') continue;
      if (post.type === 'Sidecar') {
        if (post.images?.length) for (const img of post.images) { if (urls.length < limit) urls.push(img); }
        else if (post.childPosts?.length) for (const child of post.childPosts) { if (urls.length < limit && child.displayUrl) urls.push(child.displayUrl); }
      } else if (post.displayUrl) urls.push(post.displayUrl);
    }
    if (urls.length >= limit) break;
  }
  return urls;
}

// ── 이미지 다운로드 ────────────────────────────────────────────────────────
async function downloadImage(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.instagram.com/', Accept: 'image/*' }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ── Supabase 업로드 ────────────────────────────────────────────────────────
async function uploadToSupabase(slug, index, buffer) {
  const path = `${slug}/img${index}.jpg`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: buffer,
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ── DB html_content 업데이트 ───────────────────────────────────────────────
async function updateDbHtml(id, html) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ html_content: html }),
  });
  if (!r.ok) throw new Error(`DB 업데이트 실패: ${r.status}`);
}

// ── 인스타 핸들 추출 ────────────────────────────────────────────────────────
function extractHandle(instagramUrl) {
  if (!instagramUrl) return null;
  const m = instagramUrl.match(/instagram\.com\/([^/?#]+)/);
  return m ? m[1].replace(/\/$/, '') : null;
}

// ── 메인 ──────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(60)}`);
console.log(`Blob 이미지 Supabase 마이그레이션 ${DRY_RUN ? '[DRY-RUN]' : ''}`);
console.log(`${'='.repeat(60)}\n`);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}

// 대상 원고 조회
const res = await fetch(
  `${SUPABASE_URL}/rest/v1/articles?select=id,person_name,slug,instagram_url,html_content,source_path&published_at=is.null&html_content=like.*blob.vercel-storage*&order=publish_date.asc`,
  { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
);
const allRows = await res.json();
const rows = allRows.filter(r => r.instagram_url).slice(START, START + LIMIT);

console.log(`전체 Blob URL 원고: ${allRows.length}개`);
console.log(`instagram_url 있는 것: ${allRows.filter(r => r.instagram_url).length}개`);
console.log(`이번 처리 대상: ${rows.length}개 (START=${START}, LIMIT=${LIMIT === Infinity ? '∞' : LIMIT})\n`);

if (DRY_RUN) {
  console.log('DRY-RUN: 처리 대상 목록만 출력\n');
  rows.forEach((r, i) => console.log(`${i + 1}. ${r.person_name} (${r.slug}) — ${r.instagram_url}`));
  process.exit(0);
}

await ensureApifyToken();

const SUPA_BASE = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
let success = 0, fail = 0;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const handle = extractHandle(row.instagram_url);
  const slug = row.slug;

  console.log(`\n[${i + 1}/${rows.length}] ${row.person_name} (${slug}) — @${handle}`);

  if (!handle) {
    console.log('  ✗ 핸들 추출 실패, 건너뜀');
    fail++;
    continue;
  }

  // 현재 html에서 Blob URL 개수 확인
  const blobUrls = [...(row.html_content.matchAll(/src="(https:\/\/[^"]+blob\.vercel-storage[^"]*)"/g))].map(m => m[1]);
  if (blobUrls.length === 0) {
    console.log('  ✓ Blob URL 없음 (이미 처리됨)');
    success++;
    continue;
  }
  console.log(`  Blob URL ${blobUrls.length}개 교체 필요`);

  // Blob URL에서 실제 ASCII storage slug 추출 (DB slug가 한글일 수 있으므로)
  const blobSlugMatch = row.html_content.match(/blob\.vercel-storage\.com\/article-images\/([^/]+)\//);
  const storageSlug = blobSlugMatch ? decodeURIComponent(blobSlugMatch[1]) : slug;

  try {
    // Apify 수집
    process.stdout.write('  Apify 수집 중...');
    const profiles = await runActor(handle);
    const urls = extractUrls(profiles, 8);
    console.log(` ${urls.length}개 수집됨`);

    if (urls.length === 0) throw new Error('이미지 수집 실패');

    // 이미 Supabase에 있는 이미지 인덱스 파악
    let html = row.html_content;
    const supaImgs = [...html.matchAll(new RegExp(`src="(${SUPA_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${storageSlug}/img(\\d+)\\.jpg)"`, 'g'))];
    const maxSupaIdx = supaImgs.reduce((m, [, , n]) => Math.max(m, parseInt(n)), 0);

    // Blob URL들을 순서대로 새 URL로 교체
    let imgIdx = maxSupaIdx + 1;
    let urlIdx = 0;
    let replaced = 0;

    for (const blobUrl of blobUrls) {
      let done = false;
      while (urlIdx < urls.length) {
        const newUrl = urls[urlIdx++];
        process.stdout.write(`  [img${imgIdx}] 다운로드...`);
        try {
          const buf = await downloadImage(newUrl);
          const supaUrl = await uploadToSupabase(storageSlug, imgIdx, buf);
          html = html.replace(blobUrl, supaUrl);
          process.stdout.write(` ✓\n`);
          imgIdx++;
          replaced++;
          done = true;
          break;
        } catch (e) {
          process.stdout.write(` ✗ ${e.message}\n`);
        }
      }
      if (!done) console.log(`  ✗ img${imgIdx} 교체 실패 (URL 부족)`);
    }

    if (replaced > 0) {
      // DB 업데이트
      await updateDbHtml(row.id, html);
      console.log(`  ✓ DB 업데이트 완료 (${replaced}/${blobUrls.length}개 교체)`);

      // source_path 파일도 업데이트
      if (row.source_path) {
        const filePath = resolve(row.source_path);
        if (existsSync(filePath)) {
          writeFileSync(filePath, html, 'utf8');
          console.log(`  ✓ output 파일 업데이트: ${row.source_path}`);
        }
      }
      success++;
    } else {
      console.log(`  ✗ 교체 실패`);
      fail++;
    }
  } catch (e) {
    console.log(`  ✗ 오류: ${e.message}`);
    fail++;
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`완료: 성공 ${success}개, 실패 ${fail}개`);
console.log(`${'='.repeat(60)}\n`);
