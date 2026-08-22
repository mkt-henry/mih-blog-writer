export const MIH_BLOG_SLUGS = ['gdfdhzgfgfhgdj', 'mih_speaker', 'mih_casting', 'mih_agency', 'kyh620303'] as const;

export function isMihExposed(html: string): boolean {
  if (!html) return false;
  return MIH_BLOG_SLUGS.some((s) => html.includes(`blog.naver.com/${s}`));
}

export type SerpEntry = { rank: number; url: string; slug: string };

export type SerpResult = {
  indexed: boolean;
  rank: number | null;
  entries: SerpEntry[];
  competitors: SerpEntry[];
  parseFailed: boolean;
};

const COMPETITOR_LIMIT = 5;

/** blog.naver.com/<slug>/<postId> 형태만 잡는다. PostList.naver 등 목록 링크는 제외된다.
 *  m.blog.naver.com 과 프로토콜 상대 URL(//...)도 같은 정규 URL로 접는다.
 *
 *  네이버 통합검색의 DOM 구조에 기대지 않는 이유: 구조는 자주 바뀌지만 링크 형태는 안정적이다.
 *  여기서 세는 것은 절대 SERP 순위가 아니라 "검색 페이지에 등장한 블로그 글 중 몇 번째"이며,
 *  목적이 추세 비교라 이 정의로 충분하다. */
const POST_LINK = /(?:https?:)?\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/g;

function isOurs(slug: string): boolean {
  return (MIH_BLOG_SLUGS as readonly string[]).includes(slug);
}

export function parseSerp(html: string): SerpResult {
  const entries: SerpEntry[] = [];
  const seen = new Set<string>();

  if (html) {
    for (const m of html.matchAll(POST_LINK)) {
      const slug = m[1];
      const url = `https://blog.naver.com/${slug}/${m[2]}`;
      if (seen.has(url)) continue;
      seen.add(url);
      entries.push({ rank: entries.length + 1, url, slug });
    }
  }

  const ours = entries.filter((e) => isOurs(e.slug));

  return {
    indexed: ours.length > 0,
    rank: ours.length > 0 ? ours[0].rank : null,
    entries,
    competitors: entries.filter((e) => !isOurs(e.slug)).slice(0, COMPETITOR_LIMIT),
    // 링크가 하나도 안 잡히면 네이버가 응답을 막았거나 링크 형태가 바뀐 것이다.
    // 미노출과 구분해서 남겨야 파싱 고장을 "노출 안 됨"으로 오독하지 않는다.
    parseFailed: entries.length === 0,
  };
}
