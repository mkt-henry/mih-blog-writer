#!/usr/bin/env node
// 단일 원고 HTML 파일을 Supabase articles 테이블에 publish (upsert).
//
// 사용법:
//   node scripts/publish-article.js <html-path> [--instagram <url>]
//   npm run publish "output/2026-05-21/mih_agency/박혜신_....html"
//   npm run publish "output/.../폴킴_....html" --instagram https://www.instagram.com/paulkim.official/
//
// upsert 키: (publish_date, agency, slug). 같은 키로 다시 publish 하면 본문 갱신.
// --instagram(또는 --ig) 으로 공식 인스타그램 URL을 함께 전달하면 메타까지 한 번에 등록된다.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/env.js';
import { parseArticlePath } from './lib/parse-article-path.js';
import { supabaseUpsert } from './lib/supabase-rest.js';
import { namesOf, excludeReason, buildNameIndex, fetchAll } from '../lib/name-match.mjs';

loadEnv();

// --instagram <url> / --ig <url> 플래그 분리 (positional 경로 인자는 그대로 유지)
const rawArgs = process.argv.slice(2);
let instagramUrl = null;
let force = false;
const positional = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === '--force') {
    force = true;
  } else if (a === '--instagram' || a === '--ig') {
    instagramUrl = rawArgs[++i] || null;
  } else if (a.startsWith('--instagram=') || a.startsWith('--ig=')) {
    instagramUrl = a.slice(a.indexOf('=') + 1) || null;
  } else {
    positional.push(a);
  }
}

const argPath = positional[0];
if (!argPath) {
  console.error('사용법: node scripts/publish-article.js <html-path> [--instagram <url>]');
  process.exit(1);
}

const fullPath = resolve(argPath);
if (!existsSync(fullPath)) {
  console.error(`파일을 찾지 못함: ${fullPath}`);
  process.exit(1);
}

const parsed = parseArticlePath(argPath);
if (!parsed) {
  console.error(
    `경로를 파싱할 수 없습니다. 형식: output/{YYYY-MM-DD}/{mih_speaker|mih_casting|mih_agency|other}/{slug}_{제목}.html\n` +
    `입력: ${argPath}`
  );
  process.exit(1);
}

// 발행 직전 중복 게이트.
// check-keyword.mjs 는 "작성 착수 전"에만 도는 수동 절차라, 두 대에서 같은 인물을
// 각자 쓰거나 절차를 건너뛰면 그대로 발행까지 새어 나갔다(2026-08 정리에서 11건 확인).
// 실제로 발행되는 지점은 여기 한 곳뿐이므로 여기서 한 번 더 막는다.
// 자기 자신(같은 publish_date+agency+slug 재발행)은 제외한다. 의도적 중복은 --force.
if (!force) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const rows = await fetchAll(
    sb,
    'articles',
    'person_name,title,agency,publish_date,slug,published_at,published_url'
  );
  const others = rows.filter(
    (r) =>
      !(r.publish_date === parsed.publishDate && r.agency === parsed.agency && r.slug === parsed.slug)
  );
  const { written, published } = buildNameIndex(others);
  const hit = namesOf({ person_name: parsed.personName, title: parsed.title })
    .map((n) => excludeReason(n, written))
    .find(Boolean);
  if (hit) {
    const prev = others.find((r) => namesOf(r).includes(hit.matched));
    const state = published.has(hit.matched) ? '발행 완료' : '원고 있음(발행 대기)';
    console.error(`✗ 중복 — "${hit.matched}" 원고가 이미 있습니다 (${hit.via}).`);
    if (prev) console.error(`  기존: ${prev.publish_date}/${prev.agency} · ${state} · ${prev.title}`);
    console.error('  같은 인물을 일부러 한 번 더 발행하려면 --force 를 붙이세요.');
    process.exit(1);
  }
}

const html = readFileSync(fullPath, 'utf8');
const row = {
  publish_date: parsed.publishDate,
  agency: parsed.agency,
  slug: parsed.slug,
  person_name: parsed.personName,
  title: parsed.title,
  html_content: html,
  source_path: parsed.sourcePath,
};
// 공식 인스타그램 URL을 함께 전달한 경우에만 메타 컬럼을 갱신한다.
// (merge-duplicates upsert는 제공한 컬럼만 갱신하므로, 미전달 시 기존 값을 덮어쓰지 않는다.)
if (instagramUrl) row.instagram_url = instagramUrl;

try {
  await supabaseUpsert('articles', row, { onConflict: 'publish_date,agency,slug' });
  const igNote = instagramUrl ? ` · instagram ✓` : '';
  console.log(`✓ published ${parsed.slug} (${parsed.agency} / ${parsed.publishDate})${igNote}`);
} catch (e) {
  console.error('✗ publish 실패:', e.message);
  process.exit(1);
}
