import { extractTitleKeyword } from '@/lib/rss-matcher';

export type ArticleForKeyword = {
  title: string;
  person_name: string;
};

export function extractUniqueKeywords(articles: ArticleForKeyword[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of articles) {
    const fromTitle = extractTitleKeyword(a.title);
    const kw = (fromTitle ?? a.person_name).trim();
    if (!kw) continue;
    if (seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
  }
  return out;
}
