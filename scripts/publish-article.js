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
import { loadEnv } from './lib/env.js';
import { parseArticlePath } from './lib/parse-article-path.js';
import { supabaseUpsert } from './lib/supabase-rest.js';

loadEnv();

// --instagram <url> / --ig <url> 플래그 분리 (positional 경로 인자는 그대로 유지)
const rawArgs = process.argv.slice(2);
let instagramUrl = null;
const positional = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === '--instagram' || a === '--ig') {
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
    `경로를 파싱할 수 없습니다. 형식: output/{YYYY-MM-DD}/{mih_speaker|mih_casting|mih_agency}/{slug}_{제목}.html\n` +
    `입력: ${argPath}`
  );
  process.exit(1);
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
