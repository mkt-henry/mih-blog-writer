#!/usr/bin/env node
// output/**/*.html 을 모두 읽어 articles 테이블에 upsert.
// 멱등성: unique(publish_date, agency, slug)로 중복 시 머지.
// 실패 항목은 migration-failures.log에 append.

import { readdirSync, statSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadEnv } from './lib/env.js';
import { parseFileName, AGENCIES } from './lib/parse-article-path.js';
import { supabaseUpsert } from './lib/supabase-rest.js';

loadEnv();

const ROOT = process.cwd();
const OUTPUT_DIR = join(ROOT, 'output');
const FAILURE_LOG = join(ROOT, 'migration-failures.log');
const BATCH_SIZE = 50;

function collectArticles() {
  const items = [];
  for (const dateName of readdirSync(OUTPUT_DIR)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateName)) continue;
    const dateDir = join(OUTPUT_DIR, dateName);
    if (!statSync(dateDir).isDirectory()) continue;

    for (const agencySlug of readdirSync(dateDir)) {
      if (!AGENCIES.has(agencySlug)) continue;
      const agencyDir = join(dateDir, agencySlug);
      if (!statSync(agencyDir).isDirectory()) continue;

      for (const file of readdirSync(agencyDir)) {
        const parsed = parseFileName(file);
        if (!parsed) continue;
        const fullPath = join(agencyDir, file);
        const html = readFileSync(fullPath, 'utf8');
        items.push({
          publish_date: dateName,
          agency: agencySlug,
          slug: parsed.slug,
          person_name: parsed.slug,
          title: parsed.title,
          html_content: html,
          source_path: `${dateName}/${agencySlug}/${file}`,
        });
      }
    }
  }
  return items;
}

async function main() {
  const articles = collectArticles();
  console.log(`발견: ${articles.length}개 원고`);
  if (articles.length === 0) {
    console.log('업로드할 원고 없음.');
    return;
  }

  // 시작 시 실패 로그 초기화
  writeFileSync(FAILURE_LOG, '');

  let success = 0;
  let failed = 0;
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    try {
      await supabaseUpsert('articles', batch, {
        onConflict: 'publish_date,agency,slug',
      });
      success += batch.length;
      console.log(`  ✓ [${success}/${articles.length}] 배치 ${batch.length}건 업로드`);
    } catch (err) {
      // 배치 실패 시 1건씩 재시도 — 어떤 row가 문제인지 찾기 위해
      console.warn(`  ⚠ 배치 실패: ${err.message} — 1건씩 재시도`);
      for (const row of batch) {
        try {
          await supabaseUpsert('articles', row, { onConflict: 'publish_date,agency,slug' });
          success += 1;
          console.log(`    ✓ ${row.publish_date}/${row.agency}/${row.slug}`);
        } catch (err2) {
          failed += 1;
          const line = `${row.source_path}\t${err2.message}\n`;
          appendFileSync(FAILURE_LOG, line);
          console.error(`    ✗ ${row.source_path}: ${err2.message}`);
        }
      }
    }
  }

  console.log('');
  console.log(`완료: 성공 ${success}, 실패 ${failed}`);
  if (failed > 0) {
    console.log(`실패 항목은 ${FAILURE_LOG} 참조`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
