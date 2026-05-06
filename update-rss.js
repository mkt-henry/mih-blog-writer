#!/usr/bin/env node
// node update-rss.js -> 네이버 블로그 RSS를 받아 index.html / 원고_모아보기.html 발행 목록을 갱신합니다.

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const RSS_URL = "https://rss.blog.naver.com/mih_ent.xml";
const TARGET_FILES = [
  join(__dir, "output", "index.html"),
  join(__dir, "output", "원고_모아보기.html"),
];

function parseDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d)) return { date: "", time: "" };
  const kst = new Date(d.getTime() + 9 * 3600000);
  return {
    date: kst.toISOString().slice(0, 10),
    time: kst.toISOString().slice(11, 16)
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
    const { date, time } = parseDate(pubDateMatch[1].trim());
    if (!date) continue;
    items.push({
      date,
      time,
      title: titleMatch[1].trim(),
      url: cleanUrl(linkMatch[1])
    });
  }
  return items;
}

function extractExistingUrls(html) {
  const match = html.match(/const publishedPosts\s*=\s*\[([\s\S]*?)\];/);
  if (!match) return new Set();
  const urls = [];
  const urlRegex = /"url"\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = urlRegex.exec(match[1])) !== null) {
    urls.push(m[1]);
  }
  return new Set(urls);
}

function escapeForJs(str) {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function injectPublishedPosts(html, freshItems) {
  const existingUrls = extractExistingUrls(html);
  const newItems = freshItems.filter((item) => !existingUrls.has(item.url));
  if (!newItems.length) return { html, count: 0 };

  const lines = newItems.map(
    (item) =>
      `      {"source":"published","date":"${item.date}","publishedAt":"${item.date} ${item.time}","title":"${escapeForJs(item.title)}","url":"${item.url}"},`
  );
  const insertion = lines.join("\n") + "\n";

  return {
    html: html.replace(/(\s*const publishedPosts\s*=\s*\[)\s*\n/, `$1\n${insertion}`),
    count: newItems.length
  };
}

async function main() {
  console.log("RSS 가져오는 중:", RSS_URL);
  const res = await fetch(RSS_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; blog-reader/1.0)" }
  });
  if (!res.ok) throw new Error(`RSS 요청 실패: ${res.status}`);

  const xml = await res.text();
  const items = parseRss(xml);
  console.log(`RSS 파싱 완료: ${items.length}개 항목`);
  if (!items.length) {
    console.log("항목 없음, 종료");
    return;
  }

  let totalCount = 0;
  for (const filePath of TARGET_FILES) {
    const fileName = filePath.split(/[/\\]/).pop();
    const html = readFileSync(filePath, "utf8");
    const { html: updated, count } = injectPublishedPosts(html, items);
    if (!count) {
      console.log(`[${fileName}] 새 항목 없음`);
      continue;
    }
    writeFileSync(filePath, updated, "utf8");
    console.log(`[${fileName}] ${count}개 항목 추가`);
    totalCount += count;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
