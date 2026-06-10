import { supabaseAdmin } from "@/lib/supabase";
import ShareKeywordsClient from "./_components/ShareKeywordsClient";

export const dynamic = "force-dynamic";

export default async function PublicKeywordsPage() {
  const sb = supabaseAdmin();

  const [kwRes, artRes] = await Promise.all([
    sb.from("keywords").select("keyword,category,published_url").order("category").order("keyword"),
    sb.from("articles").select("person_name,published_url").not("published_url", "is", null),
  ]);

  if (kwRes.error) {
    return <main className="p-8 text-red-600">데이터를 불러올 수 없습니다.</main>;
  }

  // articles의 published_url을 keyword 기준으로 병합 (keywords 테이블 값 우선)
  const artMap = new Map<string, string>();
  for (const a of artRes.data ?? []) {
    if (a.person_name && a.published_url && !artMap.has(a.person_name)) {
      artMap.set(a.person_name, a.published_url);
    }
  }

  type Row = { keyword: string; category: string; published_url: string | null };
  const rows: Row[] = (kwRes.data ?? []).map((k) => ({
    keyword: k.keyword,
    category: k.category ?? "",
    published_url: (k.published_url as string | null) ?? artMap.get(k.keyword) ?? null,
  }));

  return <ShareKeywordsClient rows={rows} />;
}
