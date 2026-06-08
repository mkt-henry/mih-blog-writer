import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
import { loadKeywordOnlyColumns, KEYWORD_COLUMNS } from "@/lib/keyword-columns";
import KeywordClient, { type Keyword } from "./_components/KeywordClient";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const perms = await loadPermissions(user.id, user.username);
  const keywordOnly = perms.keywordOnly;
  // 키워드 전용 사용자는 editor 기능(원고/상태필터/KPI)을 절대 보지 않는다.
  const isEditor =
    !keywordOnly &&
    (perms.isAdmin || Object.values(perms.agencies).some((r) => r === "editor"));

  const visibleColumns = keywordOnly ? await loadKeywordOnlyColumns() : null;

  // 키워드 전용 사용자는 노출 컬럼에 해당하는 DB 필드만 select (id/keyword/category/created_at 는 항상)
  const selectFields = (() => {
    if (!visibleColumns) return "id,keyword,category,notes,instagram,agency,published_url,created_at";
    const fields = new Set<string>(["id", "keyword", "category", "created_at"]);
    for (const col of visibleColumns) {
      const meta = KEYWORD_COLUMNS.find((c) => c.key === col);
      if (meta?.selectField) fields.add(meta.selectField);
    }
    return [...fields].join(",");
  })();

  const sb = supabaseAdmin();

  const [kwRes, artRes] = await Promise.all([
    sb.from("keywords").select(selectFields).order("category").order("keyword"),
    keywordOnly
      ? Promise.resolve({ data: [], error: null })
      : sb.from("articles").select("id,person_name,title,published_url,agency"),
  ]);

  if (kwRes.error) {
    return <main className="p-6 text-red-700">DB 조회 실패: {kwRes.error.message}</main>;
  }

  type ArtEntry = { id: string; title: string; published_url: string | null; agency: string | null };
  const articleMap = new Map<string, ArtEntry>();
  for (const a of artRes.data ?? []) {
    const existing = articleMap.get(a.person_name as string);
    // published_url 있는 행을 우선 보존
    if (!existing || (!existing.published_url && a.published_url)) {
      articleMap.set(a.person_name as string, {
        id: a.id as string,
        title: a.title as string,
        published_url: a.published_url as string | null,
        agency: a.agency as string | null,
      });
    }
  }

  const kwRows = (kwRes.data ?? []) as unknown as Record<string, unknown>[];
  const keywords: Keyword[] = kwRows.map((k: Record<string, unknown>) => {
    const name = k.keyword as string;
    const art = articleMap.get(name);
    return {
      id: k.id as string,
      keyword: name,
      category: (k.category as string) ?? "",
      notes: (k.notes as string | null) ?? null,
      instagram: (k.instagram as string | null) ?? null,
      created_at: (k.created_at as string) ?? "",
      agency: (k.agency as string | null) ?? art?.agency ?? null,
      published_url: (k.published_url as string | null) ?? art?.published_url ?? null,
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

      <KeywordClient keywords={keywords} categories={categories} isEditor={isEditor} visibleColumns={visibleColumns} />
    </div>
  );
}
