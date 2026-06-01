export function normalizeTitle(s: string): string {
  return s
    .replace(/[ 　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTitleKeyword(rawTitle: string): string | null {
  const title = normalizeTitle(rawTitle);
  const m = title.match(/^\[([^\]]+?)(?:\s+섭외)?\]/);
  return m ? m[1].trim() : null;
}

export type AgencySlug = 'mih_speaker' | 'mih_casting' | 'mih_agency' | 'other';

export type ArticleCandidate = {
  id: string;
  person_name: string;
  slug: string;
  title: string;
  agency: AgencySlug;
  created_at: string;
  published_at: string | null;
};

export type RssItem = {
  agency: AgencySlug;
  title: string;
  link: string;
  pub_ts: number;
};

export type MatchReason =
  | 'exact_title'
  | 'person_name_bracket'
  | 'keyword_to_person'
  | 'keyword_to_slug'
  | 'none';

export type MatchResult = {
  matched: ArticleCandidate | null;
  reason: MatchReason;
};

function pickOldest(cands: ArticleCandidate[]): ArticleCandidate {
  return [...cands].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}

export function matchRssItem(rss: RssItem, candidates: ArticleCandidate[]): MatchResult {
  const sameAgency = candidates.filter((c) => c.agency === rss.agency && c.published_at === null);
  if (sameAgency.length === 0) return { matched: null, reason: 'none' };

  const rssNorm = normalizeTitle(rss.title);

  const exact = sameAgency.filter((c) => normalizeTitle(c.title) === rssNorm);
  if (exact.length > 0) return { matched: pickOldest(exact), reason: 'exact_title' };

  const rssKeyword = extractTitleKeyword(rss.title);
  if (rssKeyword) {
    const personMatch = sameAgency.filter(
      (c) => normalizeTitle(c.person_name) === normalizeTitle(rssKeyword)
    );
    if (personMatch.length > 0) {
      const expectedBracket = `[${rssKeyword} 섭외]`;
      const rssHasBracket = rssNorm.startsWith(expectedBracket);
      return {
        matched: pickOldest(personMatch),
        reason: rssHasBracket ? 'person_name_bracket' : 'keyword_to_person',
      };
    }

    const slugMatch = sameAgency.filter((c) => c.slug === rssKeyword);
    if (slugMatch.length > 0) return { matched: pickOldest(slugMatch), reason: 'keyword_to_slug' };
  }

  return { matched: null, reason: 'none' };
}
