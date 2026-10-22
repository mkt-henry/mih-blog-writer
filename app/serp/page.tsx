import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
import { REPORT_AGENCIES } from "@/lib/daily-report";
import {
  fetchLoggedOutBlogResults,
  mobileSearchUrl,
  type BlogResult,
  type SearchSurface,
} from "@/lib/naver-search/blog-results";

export const dynamic = "force-dynamic";

const BLOG_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(REPORT_AGENCIES).map((a) => [a.blog, a.label]),
);
BLOG_LABEL.mih_speaker ??= "예전 스피커";

const postKey = (u: string) => u.match(/blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/)?.slice(1).join("/") ?? "";

// 검색 노출 탭에서 키워드를 누르면 여는 "시크릿 검색" (Owner 2026-10-22).
// 로그인된 브라우저는 개인화로 우리 글이 위로 보이므로, 서버가 로그인 없이 받은 네이버 모바일 검색의 블로그 글 순서를 보여 준다.
// 기본은 통합검색(지금 검색 링크가 휴대폰에서 넘어가는 곳), 블로그 탭은 30위까지.
export default async function SerpPage({ searchParams }: { searchParams: Promise<{ q?: string; post?: string; s?: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  if (perms.keywordOnly) redirect("/keywords");

  const { q = "", post = "", s } = await searchParams;
  const surface: SearchSurface = s === "blog" ? "blog" : "total";
  const query = q.trim();
  if (!query) redirect("/?tab=search");
  const target = postKey(post);

  let results: BlogResult[] = [];
  let error: string | null = null;
  try {
    results = await fetchLoggedOutBlogResults(query, surface);
  } catch {
    error = "네이버 검색을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.";
  }
  const mine = target ? results.find((r) => postKey(r.url) === target) : undefined;
  const ours = results.filter((r) => r.ours);

  return (
    <main className="mx-auto max-w-2xl px-3 py-4 pb-16">
      <div className="mb-2 flex items-center gap-1">
        <Link href="/?tab=search" aria-label="뒤로" className="-ml-1 rounded p-1 text-gray-500 hover:bg-gray-100">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="truncate text-lg font-bold">{query}</h1>
      </div>
      <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
        <span className="rounded bg-gray-800 px-1.5 py-0.5 font-semibold text-white">시크릿</span>
        <span>로그인 없이 본 네이버 검색</span>
        <div className="flex-1" />
        <a href={mobileSearchUrl(query, surface)} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-[#0068E0]">
          네이버에서 열기 <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="mb-3 flex gap-1.5">
        {(["total", "blog"] as const).map((k) => (
          <Link
            key={k}
            replace
            href={`/serp?q=${encodeURIComponent(query)}${post ? `&post=${encodeURIComponent(post)}` : ""}${k === "blog" ? "&s=blog" : ""}`}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
              surface === k ? "bg-[color:var(--color-primary)] text-white" : "border border-gray-200 bg-white text-gray-600"
            }`}
          >
            {k === "total" ? "통합검색" : "블로그 탭"}
          </Link>
        ))}
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-red-600">{error}</p>
      ) : (
        <>
          <p className="mb-2 text-sm font-semibold">
            {target
              ? mine
                ? `이 글 ${mine.rank}위`
                : `이 글 없음 (블로그 글 ${results.length}개 중)`
              : ours.length > 0
                ? `우리 글 ${ours[0].rank}위`
                : `우리 글 없음 (블로그 글 ${results.length}개 중)`}
            {ours.length > (mine ? 1 : 0) && (
              <span className="ml-2 text-xs font-normal text-gray-500">
                우리 블로그 {ours.length}건: {ours.map((r) => `${r.rank}위`).join(", ")}
              </span>
            )}
          </p>
          <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {results.map((r) => {
              const isMine = target !== "" && postKey(r.url) === target;
              return (
                <li key={r.url} className={`flex gap-2 px-3 py-2.5 ${isMine ? "bg-amber-50" : r.ours ? "bg-blue-50" : ""}`}>
                  <span className="w-6 shrink-0 pt-0.5 text-right text-sm font-bold tabular-nums text-gray-400">{r.rank}</span>
                  <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-[11px] text-gray-500">
                      <span className="truncate">{r.blogName}</span>
                      {r.ours && (
                        <span className="shrink-0 rounded bg-[color:var(--color-primary)] px-1 text-[10px] font-semibold text-white">
                          {isMine ? "이 글" : BLOG_LABEL[r.slug] ?? "우리"}
                        </span>
                      )}
                    </div>
                    <div className="line-clamp-2 text-sm font-medium text-gray-900">{r.title}</div>
                    {r.snippet && <div className="line-clamp-1 text-xs text-gray-500">{r.snippet}</div>}
                  </a>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </main>
  );
}
