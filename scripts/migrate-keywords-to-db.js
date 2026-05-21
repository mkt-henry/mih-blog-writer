#!/usr/bin/env node
// output/keywords.json 을 keywords 테이블에 일괄 upsert.

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadEnv } from './lib/env.js';
import { supabaseUpsert } from './lib/supabase-rest.js';

loadEnv();

const ROOT = process.cwd();
const KEYWORDS_JSON = join(ROOT, 'output', 'keywords.json');
const BATCH_SIZE = 200;

function loadKeywords() {
  const raw = readFileSync(KEYWORDS_JSON, 'utf8');
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error('keywords.json이 배열이 아님');
  return list.map((k) => ({
    id: k.id,
    keyword: k.keyword,
    category: k.category,
    notes: k.notes || '',
    instagram: k.instagram || null,
    agency: k.agency || null,
    published_url: k.publishedUrl || null,
    created_at: k.createdAt || new Date().toISOString(),
    updated_at: k.updatedAt || k.createdAt || new Date().toISOString(),
  }));
}

async function main() {
  const rows = loadKeywords();
  console.log(`발견: ${rows.length}개 키워드`);

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await supabaseUpsert('keywords', batch, { onConflict: 'id' });
    done += batch.length;
    console.log(`  ✓ [${done}/${rows.length}]`);
  }
  console.log('완료.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
