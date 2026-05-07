import { supabase } from "../lib/db.js";

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
    items.push({ date, time, title: titleMatch[1].trim(), url: cleanUrl(linkMatch[1]) });
  }
  return items;
}

export async function GET(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("agency");
  if (!slug) return Response.json({ error: "agency param required" }, { status: 400 });

  const { data: agency } = await supabase
    .from("agencies")
    .select("rss_url")
    .eq("slug", slug)
    .single();

  if (!agency?.rss_url) {
    return Response.json({ error: "RSS URL not configured for this agency" }, { status: 404 });
  }

  try {
    const res = await fetch(agency.rss_url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; blog-reader/1.0)" },
      cache: "no-store"
    });
    if (!res.ok) return Response.json({ error: `RSS fetch failed: ${res.status}` }, { status: 502 });
    const items = parseRss(await res.text());
    return new Response(JSON.stringify(items), {
      headers: { "content-type": "application/json", "cache-control": "s-maxage=300, stale-while-revalidate=60" }
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
