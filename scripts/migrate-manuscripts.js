#!/usr/bin/env node
// 기존 output/ HTML 원고를 Supabase manuscripts 테이블로 일괄 업로드
// 실행: node --env-file=.env.local scripts/migrate-manuscripts.js

import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dir, "..", "output");
const BATCH_SIZE = 10;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function parseFileName(filename) {
  const withoutExt = filename.slice(0, -5);
  const idx = withoutExt.indexOf("_");
  if (idx === -1) return null;
  return {
    slug: withoutExt.slice(0, idx),
    title: withoutExt.slice(idx + 1)
  };
}

async function main() {
  const manuscripts = [];

  for (const entry of readdirSync(OUTPUT_DIR)) {
    const fullPath = join(OUTPUT_DIR, entry);
    if (!statSync(fullPath).isDirectory()) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;

    for (const file of readdirSync(fullPath)) {
      if (!file.endsWith(".html")) continue;
      const parsed = parseFileName(file);
      if (!parsed) continue;

      manuscripts.push({
        file_path: `${entry}/${file}`,
        title: parsed.title,
        slug: parsed.slug,
        date: entry,
        html_content: readFileSync(join(fullPath, file), "utf8")
      });
    }
  }

  console.log(`원고 ${manuscripts.length}개 발견`);

  let count = 0;
  for (let i = 0; i < manuscripts.length; i += BATCH_SIZE) {
    const batch = manuscripts.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("manuscripts")
      .upsert(batch, { onConflict: "file_path" });

    if (error) {
      console.error(`배치 오류 (${i}~${i + batch.length}):`, error.message);
    } else {
      count += batch.length;
      console.log(`업로드 ${count}/${manuscripts.length}`);
    }
  }

  console.log("마이그레이션 완료");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
