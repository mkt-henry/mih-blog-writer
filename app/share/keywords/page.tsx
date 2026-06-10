import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PublicKeywordsPage() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("keywords")
    .select("keyword,category,published_url")
    .order("category")
    .order("keyword");

  if (error) {
    return (
      <main className="p-8 text-red-600 font-medium">
        데이터를 불러올 수 없습니다.
      </main>
    );
  }

  const rows = (data ?? []) as { keyword: string; category: string; published_url: string | null }[];
  const publishedCount = rows.filter((r) => r.published_url).length;

  return (
    <main className="min-h-screen bg-white px-4 py-8 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">섭외 키워드 목록</h1>
      <p className="text-sm text-gray-400 mb-6">
        전체 {rows.length}건 · 발행 완료 {publishedCount}건
      </p>

      <div className="rounded-lg border border-gray-100 overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "2rem" }} />
            <col style={{ width: "35%" }} />
            <col style={{ width: "5rem" }} />
            <col />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
              <th className="px-3 py-2 text-right font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">키워드</th>
              <th className="px-3 py-2 text-left font-medium">분류</th>
              <th className="px-3 py-2 text-left font-medium">발행 URL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r, idx) => (
              <tr key={r.keyword + idx} className="hover:bg-gray-50/60">
                <td className="px-3 py-1.5 text-right text-xs text-gray-300 tabular-nums">{idx + 1}</td>
                <td className="px-3 py-1.5 font-medium text-gray-800">{r.keyword}</td>
                <td className="px-3 py-1.5 text-xs text-gray-400 whitespace-nowrap">{r.category}</td>
                <td className="px-3 py-1.5 text-xs truncate">
                  {r.published_url ? (
                    <a
                      href={r.published_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      {r.published_url.replace(/^https?:\/\//, "").replace(/\?.*$/, "")}
                    </a>
                  ) : (
                    <span className="text-gray-200">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
