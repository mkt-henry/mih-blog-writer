/**
 * Apify instagram-profile-scraper 로 인스타그램 이미지 수집
 *
 * 기본 모드 (URL만 출력):
 *   node scripts/collect-instagram-images.js <instagram_handle>
 *
 * 업로드 모드 (수집 즉시 Supabase Storage 업로드):
 *   node scripts/collect-instagram-images.js <instagram_handle> --upload <slug>
 *   node scripts/collect-instagram-images.js jjin_kangjin --upload jjin-kangjin
 *
 * 업로드 모드에서는 수집 직후 이미지를 즉시 다운로드·업로드하여
 * CDN URL 만료 문제를 방지한다. 출력: Supabase public URL 4개.
 */

import { readFileSync } from 'fs';

// ── 환경 변수 로드 ─────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch { /* 없으면 환경변수 그대로 */ }
}
loadEnv();

// APIFY_TOKEN 없으면 Supabase에서 자동 로드
async function ensureApifyToken() {
  if (process.env.APIFY_TOKEN) return;

  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('APIFY_TOKEN 과 SUPABASE_* 환경변수가 모두 없습니다.');
    process.exit(1);
  }

  const res = await fetch(
    `${url}/rest/v1/app_settings?key=eq.APIFY_TOKEN&select=value`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const rows = await res.json();
  if (!rows?.[0]?.value) {
    console.error('Supabase app_settings 에 APIFY_TOKEN 이 없습니다. secrets-push.js 를 먼저 실행하세요.');
    process.exit(1);
  }
  process.env.APIFY_TOKEN = rows[0].value;
  console.log('  ✓  Supabase 에서 APIFY_TOKEN 로드');
}

// ── Apify Actor 실행 ───────────────────────────────────────────────────────
async function runActor(username) {
  const token = process.env.APIFY_TOKEN;
  const input = {
    usernames: [username],
    resultsLimit: 12,
    resultsType: 'posts',
  };

  console.log(`  Apify Actor 실행 중 (username: ${username})...`);

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  if (!runRes.ok) {
    const txt = await runRes.text();
    throw new Error(`Actor 실행 실패: ${runRes.status} ${txt}`);
  }
  const { data: runData } = await runRes.json();
  const runId = runData.id;
  console.log(`  runId: ${runId} — 완료 대기 중...`);

  for (let i = 0; i < 36; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
    );
    const { data: s } = await statusRes.json();
    if (s.status === 'SUCCEEDED') break;
    if (s.status === 'FAILED' || s.status === 'ABORTED') {
      throw new Error(`Actor 실패: ${s.status}`);
    }
    process.stdout.write('.');
  }
  console.log('\n  Actor 완료.');

  const dsRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}&limit=20`
  );
  return await dsRes.json();
}

// ── 이미지 URL 추출 ────────────────────────────────────────────────────────
function extractUrls(profiles, limit = 6) {
  const urls = [];
  for (const profile of profiles) {
    const posts = profile.latestPosts ?? [];
    for (const post of posts) {
      if (urls.length >= limit) break;
      if (post.type === 'Video') continue;
      if (post.type === 'Sidecar') {
        if (post.images?.length) {
          for (const img of post.images) {
            if (urls.length >= limit) break;
            urls.push(img);
          }
        } else if (post.childPosts?.length) {
          for (const child of post.childPosts) {
            if (urls.length >= limit) break;
            if (child.displayUrl) urls.push(child.displayUrl);
          }
        }
      } else if (post.displayUrl) {
        urls.push(post.displayUrl);
      }
    }
    if (urls.length >= limit) break;
  }
  return urls;
}

// ── Supabase Storage 업로드 ──────────────────────────────────────────────────
async function uploadToSupabase(slug, index, buffer) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BUCKET = 'article-images';

  const path = `${slug}/img${index}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ── 이미지 다운로드 ────────────────────────────────────────────────────────
async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://www.instagram.com/',
      Accept: 'image/jpeg,image/png,image/*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── CLI 인수 파싱 ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let handle = null;
let uploadSlug = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--upload' || args[i] === '-u') {
    uploadSlug = args[++i] || null;
  } else if (!handle) {
    handle = args[i];
  }
}

if (!handle) {
  console.error('사용법: node scripts/collect-instagram-images.js <instagram_handle> [--upload <slug>]');
  process.exit(1);
}

// ── 메인 ──────────────────────────────────────────────────────────────────
await ensureApifyToken();
const profiles = await runActor(handle);
const urls = extractUrls(profiles, uploadSlug ? 6 : 4);

if (urls.length < 4) {
  console.warn(`\n⚠  이미지 ${urls.length}개만 수집됨 (4개 필요). 계정이 비공개이거나 게시물 수가 적을 수 있습니다.`);
}

// ── 업로드 모드 ────────────────────────────────────────────────────────────
if (uploadSlug) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  if (!SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('업로드 모드: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
    process.exit(1);
  }

  // 버킷 확인 (없으면 생성)
  await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'article-images', name: 'article-images', public: true }),
  });

  console.log(`\n── 이미지 수집 & Supabase 업로드 (slug: ${uploadSlug}) ──────────────────`);
  const supaUrls = [];
  let imgIdx = 1;

  for (const url of urls) {
    if (supaUrls.length >= 4) break;
    process.stdout.write(`[${imgIdx}] 다운로드 중...`);
    try {
      const buf = await downloadImage(url);
      const supaUrl = await uploadToSupabase(uploadSlug, imgIdx, buf);
      process.stdout.write(` ✓\n`);
      console.log(`    → ${supaUrl}`);
      supaUrls.push(supaUrl);
      imgIdx++;
    } catch (e) {
      process.stdout.write(` ✗ ${e.message}\n`);
      // 실패 시 다음 URL 시도 (imgIdx 유지)
    }
  }

  if (supaUrls.length < 4) {
    console.warn(`\n⚠  ${supaUrls.length}/4개만 업로드됨`);
  }
  console.log('──────────────────────────────────────────────────────────────────────');
  console.log('\n업로드된 Supabase URL:');
  supaUrls.forEach((u, i) => console.log(`${i + 1}. ${u}`));
  console.log(`\n출처 문구: 출처 - [아티스트명] 공식 SNS\n`);
} else {
  // ── URL 출력 모드 (기존 동작) ───────────────────────────────────────────
  console.log('\n── 수집된 이미지 URL ─────────────────────────────────────────────────');
  urls.forEach((url, i) => console.log(`${i + 1}. ${url}`));
  console.log('──────────────────────────────────────────────────────────────────────');
  console.log(`\n⚠  CDN URL은 수분 내에 만료될 수 있습니다.`);
  console.log(`   --upload <slug> 옵션으로 즉시 Supabase에 업로드하는 것을 권장합니다.\n`);
  console.log(`출처 문구: 출처 - [아티스트명] 공식 SNS\n`);
}
