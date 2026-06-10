"use client";

import { useState, useMemo } from "react";

type Row = { keyword: string; category: string; published_url: string | null; published_at: string | null };

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, ".").replace(/\.$/, "");
}

export default function ShareKeywordsClient({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("전체");
  const [pubFilter, setPubFilter] = useState<"전체" | "발행완료" | "미발행">("전체");

  const categories = useMemo(
    () => ["전체", ...Array.from(new Set(rows.map((r) => r.category))).sort()],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.keyword.toLowerCase().includes(q)) return false;
      if (cat !== "전체" && r.category !== cat) return false;
      if (pubFilter === "발행완료" && !r.published_url) return false;
      if (pubFilter === "미발행" && r.published_url) return false;
      return true;
    });
  }, [rows, query, cat, pubFilter]);

  const publishedCount = rows.filter((r) => r.published_url).length;

  return (
    <main className="min-h-screen bg-white px-4 py-8 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">섭외 키워드 목록</h1>
      <p className="text-sm text-gray-400 mb-5">
        전체 {rows.length}건 · 발행 완료 {publishedCount}건
      </p>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 px-3 text-sm border border-gray-200 rounded-md w-36 focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="h-8 px-2 text-sm border border-gray-200 rounded-md focus:outline-none"
        >
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="flex gap-1">
          {(["전체", "발행완료", "미발행"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setPubFilter(v)}
              className={`h-8 px-3 text-xs rounded-md border transition-colors ${
                pubFilter === v
                  ? v === "발행완료"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : v === "미발행"
                    ? "bg-gray-400 text-white border-gray-400"
                    : "bg-gray-700 text-white border-gray-700"
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="ml-auto self-center text-xs text-gray-400">
          {filtered.length} / {rows.length}건
        </span>
      </div>

      {/* 테이블 */}
      <div className="rounded-lg border border-gray-100 overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "2rem" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "5rem" }} />
            <col style={{ width: "6rem" }} />
            <col />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
              <th className="px-3 py-2 text-right font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">키워드</th>
              <th className="px-3 py-2 text-left font-medium">분류</th>
              <th className="px-3 py-2 text-left font-medium">발행 일자</th>
              <th className="px-3 py-2 text-left font-medium">발행 URL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((r, idx) => (
              <tr key={r.keyword + idx} className="hover:bg-gray-50/60">
                <td className="px-3 py-1.5 text-right text-xs text-gray-300 tabular-nums">{idx + 1}</td>
                <td className="px-3 py-1.5 font-medium text-gray-800">{r.keyword}</td>
                <td className="px-3 py-1.5 text-xs text-gray-400 whitespace-nowrap">{r.category}</td>
                <td className="px-3 py-1.5 text-xs text-gray-400 whitespace-nowrap tabular-nums">
                  {fmtDate(r.published_at) ?? <span className="text-gray-200">—</span>}
                </td>
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-gray-300">
                  결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
