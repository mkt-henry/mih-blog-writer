import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
import KeywordClient, { type Keyword } from "./_components/KeywordClient";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const perms = await loadPermissions(user.id, user.username);
  const isEditor =
    perms.isAdmin ||
    Object.values(perms.agencies).some((r) => r === "editor");

  const sb = supabaseAdmin();

  const [kwRes, artRes] = await Promise.all([
    sb
      .from("keywords")
      .select("id,keyword,category,notes,instagram,agency,published_url,created_at")
      .order("category")
      .order("keyword"),
    sb
      .from("articles")
      .select("id,person_name,title,published_url,agency"),
  ]);

  if (kwRes.error) {
    return <main className="p-6 text-red-700">DB 조회 실패: {kwRes.error.message}</main>;
  }

  const articleMap = new Map(
    (artRes.data ?? []).map((a) => [a.person_name, {
      id: a.id as string,
      title: a.title as string,
      published_url: a.published_url as string | null,
      agency: a.agency as string | null,
    }])
  );

  const keywords: Keyword[] = (kwRes.data ?? []).map((k) => {
    const art = articleMap.get(k.keyword);
    return {
      ...k,
      agency: k.agency ?? art?.agency ?? null,
      published_url: k.published_url ?? art?.published_url ?? null,
      has_article: !!art,
      article_id: art?.id ?? null,
      article_title: art?.title ?? null,
    };
  });

  const categories = [...new Set(keywords.map((k) => k.category))].sort();
  const publishedCount = keywords.filter((k) => k.published_url).length;
  const articleCount = keywords.filter((k) => k.has_article).length;

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      {/* KPI 스트립 */}
      <div className="flex gap-4 px-4 py-3 border-b border-gray-100 bg-white text-sm">
        <div>
          <span className="text-gray-400 text-xs">전체</span>
          <span className="ml-1.5 font-bold text-gray-800">{keywords.length.toLocaleString()}</span>
        </div>
        {isEditor && (
          <>
            <div>
              <span className="text-gray-400 text-xs">원고 작성</span>
              <span className="ml-1.5 font-bold text-blue-600">{articleCount}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs">발행 완료</span>
              <span className="ml-1.5 font-bold text-emerald-600">{publishedCount}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs">원고만 (미발행)</span>
              <span className="ml-1.5 font-bold text-amber-600">{keywords.filter((k) => k.has_article && !k.published_url).length}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs">미작성</span>
              <span className="ml-1.5 font-bold text-gray-400">{keywords.filter((k) => !k.has_article && !k.published_url).length}</span>
            </div>
          </>
        )}
        {categories.map((c) => {
          const cnt = keywords.filter((k) => k.category === c).length;
          return (
            <div key={c}>
              <span className="text-gray-400 text-xs">{c}</span>
              <span className="ml-1.5 font-bold text-gray-700">{cnt}</span>
            </div>
          );
        })}
      </div>

      <KeywordClient keywords={keywords} categories={categories} isEditor={isEditor} />
    </div>
  );
}
