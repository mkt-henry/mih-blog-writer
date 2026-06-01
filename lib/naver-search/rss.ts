import { extractTitleKeyword } from '@/lib/rss-matcher';

export const AGENCY_SLUGS = ['mih_speaker', 'mih_casting', 'mih_agency', 'other'] as const;
export type AgencySlug = (typeof AGENCY_SLUGS)[number];

export type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  ts: number;
};

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const title =
      (body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? body.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? '';
    const rawLink = body.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? '';
    const link = rawLink.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    const pubDate = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    if (title) items.push({ title, link, pubDate, ts: pubDate ? new Date(pubDate).getTime() : 0 });
  }
  return items;
}

const KST_OFFSET = 9 * 60 * 60 * 1000;

export function isKstDate(ts: number, dateStr: string): boolean {
  if (!ts) return false;
  return new Date(ts + KST_OFFSET).toISOString().slice(0, 10) === dateStr;
}

export function extractKeywordFromRssTitle(title: string): string {
  return extractTitleKeyword(title) ?? title.slice(0, 20);
}

export async function fetchAgencyRss(slug: AgencySlug): Promise<RssItem[]> {
  const res = await fetch(`https://rss.blog.naver.com/${slug}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MIH-Notifier/1.0)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text());
}

export type RssKeywordResult = {
  keywords: string[];
  errors: string[];
};

export async function fetchRssKeywordsForDate(dateStr: string): Promise<RssKeywordResult> {
  const errors: string[] = [];
  const seen = new Set<string>();
  const keywords: string[] = [];

  const perAgency = await Promise.all(
    AGENCY_SLUGS.map(async (slug) => {
      try {
        const items = await fetchAgencyRss(slug);
        return items.filter((r) => isKstDate(r.ts, dateStr)).sort((a, b) => a.ts - b.ts);
      } catch (e) {
        errors.push(`${slug}: ${(e as Error).message}`.slice(0, 200));
        return [];
      }
    }),
  );

  for (const items of perAgency) {
    for (const it of items) {
      const kw = extractKeywordFromRssTitle(it.title).trim();
      if (!kw || seen.has(kw)) continue;
      seen.add(kw);
      keywords.push(kw);
    }
  }

  return { keywords, errors };
}
