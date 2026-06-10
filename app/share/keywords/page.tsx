import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PublicKeywordsPage() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("keywords")
    .select("keyword,category,published_url")
    .not("published_url", "is", null)
    .order("category")
    .order("keyword");

  if (error) {
    return (
      <main className="p-8 text-red-600 font-medium">
        데이터를 불러올 수 없습니다.
      </main>
    );
  }

  const rows = (data ?? []) as { keyword: string; category: string; published_url: string }[];
  const categories = [...new Set(rows.map((r) => r.category))].sort();

  return (
    <main className="min-h-screen bg-white px-4 py-8 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">섭외 키워드 목록</h1>
      <p className="text-sm text-gray-400 mb-6">발행된 원고만 표시합니다 · {rows.length}건</p>

      {categories.map((cat) => {
        const catRows = rows.filter((r) => r.category === cat);
        return (
          <section key={cat} className="mb-8">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 border-b pb-1">
              {cat} ({catRows.length})
            </h2>
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "40%" }} />
                <col style={{ width: "60%" }} />
              </colgroup>
              <tbody>
                {catRows.map((r) => (
                  <tr key={r.keyword} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-3 font-medium text-gray-800">{r.keyword}</td>
                    <td className="py-2 truncate">
                      <a
                        href={r.published_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {r.published_url}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}
