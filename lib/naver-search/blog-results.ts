import { MIH_BLOG_SLUGS } from './exposure';

// 로그인 없이 본 네이버 블로그 검색 결과 (Owner 2026-10-22: "검색 노출을 열 때 시크릿 모드로").
// 웹 페이지는 휴대폰 브라우저를 시크릿 창으로 열 수 없다. 대신 서버가 쿠키 없이 네이버 모바일 블로그 검색을
// 받아 결과 목록을 그대로 보여 준다 — 로그인된 브라우저는 개인화로 우리 글이 위로 보이기 때문이다.

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-F956N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

export function mobileBlogSearchUrl(query: string): string {
  return `https://m.search.naver.com/search.naver?where=m_blog&query=${encodeURIComponent(query)}`;
}

export type BlogResult = {
  rank: number;
  url: string;
  slug: string;
  blogName: string;
  title: string;
  snippet: string;
  ours: boolean;
};

const ANCHOR = /<a\s[^>]*?href="((?:https?:)?\/\/(?:m\.)?blog\.naver\.com\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const HOME = /^(?:https?:)?\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/;
const POST = /^(?:https?:)?\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** 결과 하나는 블로그 홈 링크(블로그 이름) → 글 링크(제목) → 같은 글 링크(요약) 순으로 나온다.
 *  DOM 클래스는 자주 바뀌어 링크 모양과 순서에만 기댄다. 글자 없는 링크(사진)는 건너뛴다. */
export function parseBlogResults(html: string): BlogResult[] {
  const results: BlogResult[] = [];
  const bySeen = new Map<string, BlogResult>();
  const names = new Map<string, string>();

  for (const m of html.matchAll(ANCHOR)) {
    const t = text(m[2]);
    if (!t) continue;
    const home = m[1].match(HOME);
    if (home) {
      names.set(home[1], t);
      continue;
    }
    const post = m[1].match(POST);
    if (!post) continue;
    const slug = post[1];
    const url = `https://blog.naver.com/${slug}/${post[2]}`;
    const seen = bySeen.get(url);
    if (seen) {
      if (!seen.snippet && t !== seen.title) seen.snippet = t;
      continue;
    }
    const r: BlogResult = {
      rank: results.length + 1,
      url,
      slug,
      blogName: names.get(slug) ?? slug,
      title: t,
      snippet: '',
      ours: (MIH_BLOG_SLUGS as readonly string[]).includes(slug),
    };
    bySeen.set(url, r);
    results.push(r);
  }
  return results;
}

/** 쿠키를 붙이지 않고 받는다 = 로그인 안 한 사람이 보는 결과. */
export async function fetchLoggedOutBlogResults(query: string, timeoutMs = 10_000): Promise<BlogResult[]> {
  const res = await fetch(mobileBlogSearchUrl(query), {
    headers: { 'User-Agent': MOBILE_UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`naver search HTTP ${res.status}`);
  return parseBlogResults(await res.text());
}
