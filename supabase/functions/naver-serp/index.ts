// 시크릿 검색 화면(/serp)의 네이버 모바일 검색 대리 요청.
// 네이버는 클라우드 IP 대부분을 403 으로 막는다(실측 2026-10-24: Vercel sin1 과 Supabase
// ap-northeast-2·ap-southeast-1·eu·us-west 는 403, us-east-1·ap-south-1 은 200). 사이트는
// 이 함수를 x-region 헤더로 여러 지역에서 불러 보고, 처음 통과한 지역의 결과를 쓴다.
//
// 응답에는 블로그 링크(<a> 태그)만 담는다 — 원본 HTML 은 30~80만 자라 egress 를 아낀다.
// 해석은 사이트의 parseBlogResults 가 그대로 한다(lib/naver-search/blog-results.ts).
//
// 배포: verify_jwt=true 그대로(--no-verify-jwt 붙이지 말 것). 여기서 한 번 더 service_role 인지 본다.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-F956N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

/** lib/naver-search/blog-results.ts 의 ANCHOR 와 같은 모양이어야 한다. */
const ANCHOR = /<a\s[^>]*?href="((?:https?:)?\/\/(?:m\.)?blog\.naver\.com\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

/** 화면 순서 순위 — lib/naver-search/blog-results.ts 의 parseScreenOrder 와 같은 규칙이어야 한다.
 *  통합검색은 결과마다 붙는 gdid 로 묶어 웹문서·뉴스·블로그를 가리지 않고 센다(광고는 gdid 가 없다).
 *  블로그 글 링크만 순위와 함께 돌려줘 응답을 작게 둔다. */
const ANY_ANCHOR = /<a\s([^>]*)>([\s\S]*?)<\/a>/g;
const POST_IN_HREF = /blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/;
const hasText = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, "x").trim() !== "";

function screenOrder(html: string): { total: number; posts: { rank: number; post: string }[] } {
  const rankOf = new Map<string, number>();
  const posts: { rank: number; post: string }[] = [];
  const seenPost = new Set<string>();
  let total = 0;
  for (const m of html.matchAll(ANY_ANCHOR)) {
    const attrs = m[1];
    if (!hasText(m[2])) continue;
    const href = attrs.match(/\bhref="([^"]*)"/)?.[1] ?? "";
    const p = href.match(POST_IN_HREF);
    const nlog = (attrs.match(/\bdata-nlog-params="([^"]*)"/)?.[1] ?? "").replace(/&quot;/g, '"');
    const gdid = nlog.match(/"gdid"\s*:\s*"([^"]+)"/)?.[1] ?? "";
    if (!p && !gdid) continue;
    const post = p ? `${p[1].toLowerCase()}/${p[2]}` : "";
    const id = gdid || post;
    if (!rankOf.has(id)) rankOf.set(id, ++total);
    if (post && !seenPost.has(post)) {
      seenPost.add(post);
      posts.push({ rank: rankOf.get(id)!, post });
    }
  }
  return { total, posts };
}

function jwtRole(req: Request): string | null {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

function searchUrl(query: string, surface: string): string {
  const q = encodeURIComponent(query);
  return surface === "blog"
    ? `https://m.search.naver.com/search.naver?ssc=tab.m_blog.all&query=${q}`
    : `https://m.search.naver.com/search.naver?where=m&ssc=tab.m.all&query=${q}`;
}

Deno.serve(async (req) => {
  if (jwtRole(req) !== "service_role") return new Response("forbidden", { status: 403 });
  const params = new URL(req.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  if (!query) return Response.json({ error: "q required" }, { status: 400 });

  const region = Deno.env.get("SB_REGION") ?? null;
  try {
    const res = await fetch(searchUrl(query, params.get("s") ?? "total"), {
      headers: { "User-Agent": MOBILE_UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return Response.json({ region, naverStatus: res.status }, { status: 502 });
    const html = await res.text();
    const anchors = [...html.matchAll(ANCHOR)].map((m) => m[0]).join("\n");
    return Response.json({ region, naverStatus: res.status, anchors, order: screenOrder(html) });
  } catch (e) {
    return Response.json({ region, error: String(e) }, { status: 502 });
  }
});
