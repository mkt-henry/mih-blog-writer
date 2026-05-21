#!/usr/bin/env node
// 단일 원고 HTML 파일을 Supabase articles 테이블에 publish (upsert).
//
// 사용법:
//   node scripts/publish-article.js <html-path>
//   npm run publish "output/2026-05-21/mih_agency/박혜신_....html"
//
// upsert 키: (publish_date, agency, slug). 같은 키로 다시 publish 하면 본문 갱신.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { loadEnv } from './lib/env.js';
import { parseArticlePath } from './lib/parse-article-path.js';
import { supabaseUpsert } from './lib/supabase-rest.js';

loadEnv();

const argPath = process.argv[2];
if (!argPath) {
  console.error('사용법: node scripts/publish-article.js <html-path>');
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

try {
  await supabaseUpsert('articles', row, { onConflict: 'publish_date,agency,slug' });
  console.log(`✓ published ${parsed.slug} (${parsed.agency} / ${parsed.publishDate})`);
} catch (e) {
  console.error('✗ publish 실패:', e.message);
  process.exit(1);
}
