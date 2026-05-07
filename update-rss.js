#!/usr/bin/env node
// 모든 계정의 RSS를 가져와 published_posts 테이블에 upsert
// 실행: node --env-file=.env.local update-rss.js

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function parseDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d)) return null;
  const kst = new Date(d.getTime() + 9 * 3600000);
  return {
    date: kst.toISOString().slice(0, 10),
    time: kst.toISOString().slice(11, 16),
    iso: d.toISOString()
  };
}

function cleanUrl(raw) {
  let url = raw.trim();
  const cdata = url.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) url = cdata[1].trim();
  try {
    const u = new URL(url);
    u.searchParams.delete("fromRss");
    u.searchParams.delete("trackingCode");
    return u.origin + u.pathname + (u.search || "");
  } catch {
    return url;
  }
}

function parseRss(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
      block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>\s*([\s\S]*?)\s*<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!titleMatch || !linkMatch || !pubDateMatch) continue;
    const parsed = parseDate(pubDateMatch[1].trim());
    if (!parsed) continue;
    items.push({ date: parsed.date, publishedAt: parsed.iso, title: titleMatch[1].trim(), url: cleanUrl(linkMatch[1]) });
  }
  return items;
}

async function fetchRss(rssUrl) {
  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; blog-reader/1.0)" }
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  return parseRss(await res.text());
}

async function main() {
  const { data: agencies, error } = await supabase
    .from("agencies")
    .select("id, slug, name, rss_url")
    .neq("rss_url", "");

  if (error) throw error;
  if (!agencies?.length) {
    console.log("RSS URL이 설정된 계정이 없습니다.");
    return;
  }

  for (const agency of agencies) {
    console.log(`\n[${agency.name}] RSS 가져오는 중: ${agency.rss_url}`);
    try {
      const items = await fetchRss(agency.rss_url);
      console.log(`  파싱 완료: ${items.length}개`);
      if (!items.length) continue;

      const rows = items.map(item => ({
        agency_id: agency.id,
        url: item.url,
        title: item.title,
        date: item.date,
        published_at: item.publishedAt
      }));

      const { error: upsertError } = await supabase
        .from("published_posts")
        .upsert(rows, { onConflict: "agency_id,url" });

      if (upsertError) console.error(`  업로드 오류:`, upsertError.message);
      else console.log(`  ${items.length}개 upsert 완료`);
    } catch (err) {
      console.error(`  [${agency.slug}] 오류:`, err.message);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
