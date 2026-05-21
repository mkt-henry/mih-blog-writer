/**
 * Apify instagram-scraper 로 인스타그램 이미지 URL 수집
 *
 * 사용법:
 *   node scripts/collect-instagram-images.js <instagram_handle>
 *
 * 예시:
 *   node scripts/collect-instagram-images.js jjin_kangjin
 *
 * 출력: displayUrl 4개 (콘솔 + 클립보드용 텍스트)
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

  // Actor 실행 시작
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

  // 완료 대기 (폴링, 최대 3분)
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

  // 데이터셋 조회
  const dsRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}&limit=20`
  );
  return await dsRes.json();
}

// ── 메인 ──────────────────────────────────────────────────────────────────
const handle = process.argv[2];
if (!handle) {
  console.error('사용법: node scripts/collect-instagram-images.js <instagram_handle>');
  process.exit(1);
}

await ensureApifyToken();
const profiles = await runActor(handle);

// instagram-profile-scraper: 각 item의 latestPosts 배열에서 이미지 수집
const urls = [];
for (const profile of profiles) {
  const posts = profile.latestPosts ?? [];
  for (const post of posts) {
    if (urls.length >= 4) break;
    if (post.type === 'Video') continue; // 동영상 제외
    // Sidecar: images 배열 우선, 없으면 childPosts
    if (post.type === 'Sidecar') {
      if (post.images?.length) {
        for (const img of post.images) {
          if (urls.length >= 4) break;
          urls.push(img);
        }
      } else if (post.childPosts?.length) {
        for (const child of post.childPosts) {
          if (urls.length >= 4) break;
          if (child.displayUrl) urls.push(child.displayUrl);
        }
      }
    } else if (post.displayUrl) {
      urls.push(post.displayUrl);
    }
  }
  if (urls.length >= 4) break;
}

if (urls.length < 4) {
  console.warn(`\n⚠  이미지 ${urls.length}개만 수집됨 (4개 필요). 계정이 비공개이거나 게시물 수가 적을 수 있습니다.`);
}

console.log('\n── 수집된 이미지 URL ─────────────────────────────────────────────────');
urls.forEach((url, i) => console.log(`${i + 1}. ${url}`));
console.log('──────────────────────────────────────────────────────────────────────');
console.log(`\n출처 문구: 출처 - [아티스트명] 공식 SNS\n`);
