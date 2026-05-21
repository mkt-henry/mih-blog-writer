import { NextResponse } from "next/server";
import { AGENCIES, AGENCY_SLUGS, type AgencySlug } from "@/lib/agencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RSS_TTL_MS = 60 * 1000;

type RssItem = { title: string; link: string; pubDate: string };
type RssEntry = { items: RssItem[]; fetchedAt: number; error: string | null };

const rssCache = new Map<AgencySlug, RssEntry>();

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const titleMatch =
      body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      body.match(/<title>(.*?)<\/title>/);
    const title = titleMatch?.[1]?.trim() || "";
    const rawLink = body.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() || "";
    const link = rawLink.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
    const pubDate = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || "";
    if (title) items.push({ title, link, pubDate });
  }
  return items;
}

async function fetchAgencyRss(blogSlug: string): Promise<RssItem[]> {
  const url = `https://rss.blog.naver.com/${blogSlug}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MIH-Dev/1.0)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text());
}

async function getRssEntry(slug: AgencySlug, blogSlug: string): Promise<RssEntry> {
  const cached = rssCache.get(slug);
  if (cached && !cached.error && Date.now() - cached.fetchedAt < RSS_TTL_MS) {
    return cached;
  }
  try {
    const items = await fetchAgencyRss(blogSlug);
    const entry: RssEntry = { items, fetchedAt: Date.now(), error: null };
    rssCache.set(slug, entry);
    return entry;
  } catch (e) {
    const entry: RssEntry = {
      items: [],
      fetchedAt: Date.now(),
      error: e instanceof Error ? e.message : String(e),
    };
    rssCache.set(slug, entry);
    return entry;
  }
}

export async function GET() {
  const entries = await Promise.all(
    AGENCY_SLUGS.map(async (slug) => {
      const info = AGENCIES[slug];
      const entry = await getRssEntry(slug, info.blogSlug);
      return [slug, entry] as const;
    })
  );
  return NextResponse.json(Object.fromEntries(entries));
}
