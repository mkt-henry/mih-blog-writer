import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guards";
import { fetchLoggedOutScreenOrder, rankOfPost } from "@/lib/naver-search/blog-results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 오늘 화면 검색 노출 탭 아래 "성과 요약"(Owner 2026-10-31)이 키워드마다 부른다.
// 로그인 없이 본 네이버 모바일 통합검색에서 이 글이 화면 몇 번째 결과인지 — 앱 배지와 같은 수.
export async function GET(req: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const post = params.get("post") ?? "";
  if (!q || !post) return NextResponse.json({ error: "q and post required" }, { status: 400 });
  try {
    return NextResponse.json(rankOfPost(await fetchLoggedOutScreenOrder(q, "total"), post));
  } catch (e) {
    console.error("[serp-rank]", q, e);
    return NextResponse.json({ error: "naver search failed" }, { status: 502 });
  }
}
