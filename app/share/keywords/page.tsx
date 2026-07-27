import { supabaseAdmin } from "@/lib/supabase";
import ShareKeywordsClient from "./_components/ShareKeywordsClient";
import { fetchAll, norm, titleName } from "@/lib/name-match.mjs";

export const dynamic = "force-dynamic";

type KeywordRow = { keyword: string; category: string | null; published_url: string | null };
type ArticleRow = {
  person_name: string | null;
  title: string | null;
  published_url: string | null;
  published_at: string | null;
  publish_date: string | null;
};

export default async function PublicKeywordsPage() {
  const sb = supabaseAdmin();

  // fetchAll: range 없이 조회하면 1000행에서 잘려 키워드 6100+ 중 일부만 나오고
  // 발행 표기도 누락된다(PostgREST 기본 제한).
  let kwRows: KeywordRow[];
  let artRows: ArticleRow[];
  try {
    [kwRows, artRows] = await Promise.all([
      fetchAll<KeywordRow>(sb, "keywords", "keyword,category,published_url", (q) =>
        q.order("category").order("keyword"),
      ),
      fetchAll<ArticleRow>(
        sb,
        "articles",
        "person_name,title,published_url,published_at,publish_date",
        (q) => q.not("published_url", "is", null),
      ),
    ]);
  } catch {
    return <main className="p-8 text-red-600">데이터를 불러올 수 없습니다.</main>;
  }

  // 인물명은 정규화 기준으로 매칭하고, person_name 이 로마자 슬러그인 원고는 제목의 [인물명] 으로도 잡는다.
  const artMap = new Map<string, { url: string; date: string | null }>();
  for (const a of artRows) {
    if (!a.published_url) continue;
    const entry = { url: a.published_url, date: a.published_at ?? a.publish_date ?? null };
    for (const key of [norm(a.person_name), titleName(a.title)].filter(Boolean)) {
      if (!artMap.has(key)) artMap.set(key, entry);
    }
  }

  type Row = { keyword: string; category: string; published_url: string | null; published_at: string | null };
  const rows: Row[] = kwRows.map((k) => {
    const art = artMap.get(norm(k.keyword));
    return {
      keyword: k.keyword,
      category: k.category ?? "",
      published_url: (k.published_url as string | null) ?? art?.url ?? null,
      published_at: art?.date ?? null,
    };
  });

  return <ShareKeywordsClient rows={rows} />;
}
