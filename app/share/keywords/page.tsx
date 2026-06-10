import { supabaseAdmin } from "@/lib/supabase";
import ShareKeywordsClient from "./_components/ShareKeywordsClient";

export const dynamic = "force-dynamic";

export default async function PublicKeywordsPage() {
  const sb = supabaseAdmin();

  const [kwRes, artRes] = await Promise.all([
    sb.from("keywords").select("keyword,category,published_url").order("category").order("keyword"),
    sb.from("articles").select("person_name,published_url,published_at,publish_date").not("published_url", "is", null),
  ]);

  if (kwRes.error) {
    return <main className="p-8 text-red-600">데이터를 불러올 수 없습니다.</main>;
  }

  const artMap = new Map<string, { url: string; date: string | null }>();
  for (const a of artRes.data ?? []) {
    if (a.person_name && a.published_url && !artMap.has(a.person_name)) {
      artMap.set(a.person_name, {
        url: a.published_url,
        date: (a.published_at as string | null) ?? (a.publish_date as string | null) ?? null,
      });
    }
  }

  type Row = { keyword: string; category: string; published_url: string | null; published_at: string | null };
  const rows: Row[] = (kwRes.data ?? []).map((k) => {
    const art = artMap.get(k.keyword);
    return {
      keyword: k.keyword,
      category: k.category ?? "",
      published_url: (k.published_url as string | null) ?? art?.url ?? null,
      published_at: art?.date ?? null,
    };
  });

  return <ShareKeywordsClient rows={rows} />;
}
