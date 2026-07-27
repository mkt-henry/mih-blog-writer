import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
import { KEYWORD_COLUMNS } from "@/lib/keyword-columns";
import { loadKeywordOnlyColumns } from "@/lib/keyword-columns.server";
import KeywordClient, { type Keyword } from "./_components/KeywordClient";
import { fetchAll, norm, titleName } from "@/lib/name-match.mjs";

export const dynamic = "force-dynamic";

type ArticleRow = {
  id: string;
  person_name: string | null;
  title: string | null;
  published_url: string | null;
  published_at: string | null;
  agency: string | null;
};

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
    if (!visibleColumns) return "id,keyword,category,notes,instagram,agency,published_url,is_active,created_at";
    const fields = new Set<string>(["id", "keyword", "category", "is_active", "created_at"]);
    for (const col of visibleColumns) {
      const meta = KEYWORD_COLUMNS.find((c) => c.key === col);
      if (meta?.selectField) fields.add(meta.selectField);
    }
    return [...fields].join(",");
  })();

  const sb = supabaseAdmin();

  // fetchAll: PostgREST 는 range 없이 조회하면 최대 1000행만 준다.
  // keywords 6100+ / articles 1100+ 규모라 그냥 select 하면 목록과 '작성/발행' 판정이 통째로 잘린다.
  let kwRows: Record<string, unknown>[];
  let artRows: ArticleRow[];
  try {
    [kwRows, artRows] = await Promise.all([
      fetchAll<Record<string, unknown>>(sb, "keywords", selectFields, (q) =>
        q.order("category").order("keyword"),
      ),
      keywordOnly
        ? Promise.resolve([] as ArticleRow[])
        : fetchAll<ArticleRow>(sb, "articles", "id,person_name,title,published_url,published_at,agency"),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return <main className="p-6 text-red-700">DB 조회 실패: {msg}</main>;
  }

  type ArtEntry = { id: string; title: string; published_url: string | null; agency: string | null };
  // 인물명 매칭은 정규화 기준(괄호 주석 제거 + 공백 제거 + 소문자)으로 한다.
  // 또 person_name 이 로마자 슬러그(bumsup 등)인 원고가 있어 제목의 [인물명] 도 같은 원고에 매핑한다.
  const articleMap = new Map<string, ArtEntry>();
  for (const a of artRows) {
    const entry: ArtEntry = {
      id: a.id,
      title: a.title ?? "",
      // 발행 판정은 articles 가 정본이다(keywords.published_url 은 수동 입력이라 대부분 비어 있음).
      published_url: a.published_url ?? null,
      agency: a.agency ?? null,
    };
    for (const key of [norm(a.person_name), titleName(a.title)].filter(Boolean)) {
      const existing = articleMap.get(key);
      // published_url 있는 행을 우선 보존
      if (!existing || (!existing.published_url && entry.published_url)) {
        articleMap.set(key, entry);
      }
    }
  }

  const keywords: Keyword[] = kwRows.map((k: Record<string, unknown>) => {
    const name = k.keyword as string;
    const art = articleMap.get(norm(name));
    return {
      id: k.id as string,
      keyword: name,
      category: (k.category as string) ?? "",
      notes: (k.notes as string | null) ?? null,
      instagram: (k.instagram as string | null) ?? null,
      created_at: (k.created_at as string) ?? "",
      agency: (k.agency as string | null) ?? art?.agency ?? null,
      published_url: (k.published_url as string | null) ?? art?.published_url ?? null,
      is_active: (k.is_active as boolean | null) !== false,
      has_article: !!art,
      article_id: art?.id ?? null,
      article_title: art?.title ?? null,
    };
  }).filter((k) => isEditor || k.is_active);

  const activeKeywords = keywords.filter((k) => k.is_active);
  const categories = [...new Set(activeKeywords.map((k) => k.category))].sort();
  const publishedCount = activeKeywords.filter((k) => k.published_url).length;
  const articleCount = activeKeywords.filter((k) => k.has_article).length;
  const inactiveCount = keywords.length - activeKeywords.length;

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      {/* KPI 스트립 */}
      <div className="flex gap-4 px-4 py-3 border-b border-gray-100 bg-white text-sm">
        <div>
          <span className="text-gray-400 text-xs">전체</span>
          <span className="ml-1.5 font-bold text-gray-800">{activeKeywords.length.toLocaleString()}</span>
        </div>
        {isEditor && (
          <>
            <div>
              <span className="text-gray-400 text-xs">비활성</span>
              <span className="ml-1.5 font-bold text-gray-400">{inactiveCount}</span>
            </div>
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
              <span className="ml-1.5 font-bold text-amber-600">{activeKeywords.filter((k) => k.has_article && !k.published_url).length}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs">미작성</span>
              <span className="ml-1.5 font-bold text-gray-400">{activeKeywords.filter((k) => !k.has_article && !k.published_url).length}</span>
            </div>
          </>
        )}
        {categories.map((c) => {
          const cnt = activeKeywords.filter((k) => k.category === c).length;
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
