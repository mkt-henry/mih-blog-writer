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
    return Response.json({ region, naverStatus: res.status, anchors });
  } catch (e) {
    return Response.json({ region, error: String(e) }, { status: 502 });
  }
});
