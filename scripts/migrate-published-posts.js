#!/usr/bin/env node
// 원고_모아보기.html 하드코딩 publishedPosts → Supabase published_posts (mih_speaker)
// 실행: node --env-file=.env.local scripts/migrate-published-posts.js

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dir, "..", "output", "원고_모아보기.html");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function extractPublishedPosts(html) {
  const match = html.match(/const publishedPosts\s*=\s*\[([\s\S]*?)\];/);
  if (!match) return [];
  try {
    return JSON.parse(`[${match[1]}]`);
  } catch {
    return [];
  }
}

async function main() {
  const { data: agency } = await supabase
    .from("agencies").select("id").eq("slug", "mih_speaker").single();
  if (!agency) throw new Error("mih_speaker agency not found");

  const html = readFileSync(HTML_PATH, "utf8");
  const posts = extractPublishedPosts(html);
  console.log(`추출된 발행 원고: ${posts.length}개`);

  const rows = posts.map(p => ({
    agency_id: agency.id,
    url: p.url,
    title: p.title,
    date: p.date,
    published_at: p.publishedAt
      ? new Date(p.publishedAt.replace(" ", "T") + ":00+09:00").toISOString()
      : `${p.date}T00:00:00+09:00`
  }));

  const BATCH = 20;
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from("published_posts")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "agency_id,url" });
    if (error) console.error("배치 오류:", error.message);
    else { count += Math.min(BATCH, rows.length - i); console.log(`업로드 ${count}/${rows.length}`); }
  }
  console.log("마이그레이션 완료");
}

main().catch(err => { console.error(err); process.exit(1); });
