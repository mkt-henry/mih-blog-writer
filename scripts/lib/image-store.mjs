/**
 * 원고 이미지 저장소 공용 모듈.
 *
 * 저장 위치는 env 로 정한다:
 *   R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_URL 이 전부 있으면
 *   → Cloudflare R2 (전송량 무료). 공개 URL = `${R2_PUBLIC_URL}/{path}`
 *   아니면 → Supabase Storage 버킷 `article-images` (기존 경로, 전송량 과금).
 *
 * 2026-09-07 Supabase 월 전송량 한도 초과로 저장소가 통째로 차단된 게 계기다.
 * 이미 발행된 네이버 글은 Supabase URL 을 그대로 가리키므로 그 파일들은 옮기지 않고
 * 같은 경로에 더 작은 파일로 덮어쓴다(`scripts/recompress-images.mjs`).
 *
 * 업로드되는 이미지는 전부 `shrink()` 를 거친다 — 가로 800px, JPEG q80.
 * 네이버 본문 폭(~693px)보다 큰 사진은 방문자 전송량만 늘린다.
 */
import { readFileSync } from 'fs';

export const BUCKET = 'article-images';

export function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    }
  } catch { /* .env.local 없으면 환경 변수 그대로 */ }
}

const env = (k) => process.env[k];

export function backend() {
  const r2 = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'];
  return r2.every((k) => env(k)) ? 'r2' : 'supabase';
}

/** 가로 800px 이하 · JPEG q80 으로 줄인다. 작은 원본은 확대하지 않는다. */
export async function shrink(buffer, { width = 800, quality = 80 } = {}) {
  // sharp 는 여기서만 늦게 불러온다 — 미리 로드하면 Windows·Node 24 에서 process.exit() 가 libuv 단정으로 죽는다.
  const sharp = (await import('sharp')).default;
  return sharp(buffer)
    .rotate()                                   // EXIF 회전 반영
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

export function supabasePublicUrl(path) {
  return `${env('SUPABASE_URL')}/storage/v1/object/public/${BUCKET}/${path}`;
}

export function publicUrl(path) {
  return backend() === 'r2'
    ? `${env('R2_PUBLIC_URL').replace(/\/$/, '')}/${path}`
    : supabasePublicUrl(path);
}

// ── Supabase Storage ─────────────────────────────────────────────────────────
const sbHeaders = (extra = {}) => ({ Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, ...extra });

export async function putSupabase(path, buffer, contentType = 'image/jpeg') {
  const res = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': contentType, 'x-upsert': 'true' }),
    body: buffer,
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

export async function getSupabase(path) {
  const res = await fetch(supabasePublicUrl(path));
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 한 단계 목록. 폴더는 id 가 null 로 온다. 1,000개씩 끝까지 넘긴다. */
export async function listSupabase(prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// ── Cloudflare R2 (S3 호환) ──────────────────────────────────────────────────
let s3;
async function r2() {
  if (!s3) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
    });
  }
  return s3;
}

export async function putR2(path, buffer, contentType = 'image/jpeg') {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  await (await r2()).send(new PutObjectCommand({
    Bucket: env('R2_BUCKET'), Key: path, Body: buffer, ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

/** 현재 백엔드에 올리고 공개 URL 을 돌려준다. */
export async function putImage(path, buffer, contentType = 'image/jpeg') {
  if (backend() === 'r2') await putR2(path, buffer, contentType);
  else await putSupabase(path, buffer, contentType);
  return publicUrl(path);
}
