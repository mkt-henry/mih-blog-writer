import { supabaseAdmin } from "@/lib/supabase";
import KeywordClient, { type Keyword } from "./_components/KeywordClient";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const sb = supabaseAdmin();

  const [kwRes, artRes] = await Promise.all([
    sb
      .from("keywords")
      .select("id,keyword,category,notes,instagram,agency,published_url,created_at")
      .order("category")
      .order("keyword"),
    sb
      .from("articles")
      .select("person_name,published_url")
      .not("published_at", "is", null),
  ]);

  if (kwRes.error) {
    return <main className="p-6 text-red-700">DB 조회 실패: {kwRes.error.message}</main>;
  }

  // articles에서 발행된 person_name → published_url 맵
  const publishedMap = new Map<string, string>(
    (artRes.data ?? [])
      .filter((a) => a.published_url)
      .map((a) => [a.person_name, a.published_url as string])
  );

  // keywords에 articles 발행 URL 병합 (keywords.published_url 우선, 없으면 articles 기준)
  const keywords: Keyword[] = (kwRes.data ?? []).map((k) => ({
    ...k,
    published_url: k.published_url ?? publishedMap.get(k.keyword) ?? null,
  }));

  const categories = [...new Set(keywords.map((k) => k.category))].sort();
  const publishedCount = keywords.filter((k) => k.published_url).length;

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      {/* 헤더 */}
      <header className="flex items-center gap-2 bg-white border-b border-[color:var(--color-border)] px-3 py-2">
        <div className="text-sm font-bold text-[color:var(--color-primary)]">MIH</div>
        <nav className="flex gap-1 ml-1">
          <a href="/" className="px-2.5 py-1 text-xs sm:text-sm rounded text-gray-600 hover:bg-gray-50 whitespace-nowrap">모아보기</a>
          <a href="/rss" className="px-2.5 py-1 text-xs sm:text-sm rounded text-gray-600 hover:bg-gray-50 whitespace-nowrap">발행 현황</a>
          <a href="/keywords" className="px-2.5 py-1 text-xs sm:text-sm rounded bg-blue-50 text-[color:var(--color-primary)] font-semibold whitespace-nowrap">키워드</a>
        </nav>
      </header>

      {/* KPI 스트립 */}
      <div className="flex gap-4 px-4 py-3 border-b border-gray-100 bg-white text-sm">
        <div>
          <span className="text-gray-400 text-xs">전체</span>
          <span className="ml-1.5 font-bold text-gray-800">{keywords.length.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-gray-400 text-xs">발행 완료</span>
          <span className="ml-1.5 font-bold text-emerald-600">{publishedCount}</span>
        </div>
        <div>
          <span className="text-gray-400 text-xs">미발행</span>
          <span className="ml-1.5 font-bold text-gray-600">{keywords.length - publishedCount}</span>
        </div>
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

      <KeywordClient keywords={keywords} categories={categories} />
    </div>
  );
}
