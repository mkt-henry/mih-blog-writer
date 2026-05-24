"use client";

import { useState, useMemo } from "react";

const AGENCY_LABEL: Record<string, string> = {
  mih_speaker: "강연",
  mih_casting: "캐스팅",
  mih_agency: "에이전시",
};
const AGENCY_COLOR: Record<string, string> = {
  mih_speaker: "bg-blue-50 text-blue-700",
  mih_casting: "bg-purple-50 text-purple-700",
  mih_agency: "bg-green-50 text-green-700",
};

export type Keyword = {
  id: string;
  keyword: string;
  category: string;
  notes: string | null;
  instagram: string | null;
  agency: string | null;
  published_url: string | null;
  has_article: boolean;
  created_at: string;
};

type Props = { keywords: Keyword[]; categories: string[] };

export default function KeywordClient({ keywords, categories }: Props) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("전체");
  const [agency, setAgency] = useState("전체");
  const [stateFilter, setStateFilter] = useState<"전체" | "원고O/발행O" | "원고O/발행X" | "원고X/발행O" | "원고X/발행X">("전체");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keywords.filter((k) => {
      if (q && !k.keyword.toLowerCase().includes(q) && !(k.notes ?? "").toLowerCase().includes(q)) return false;
      if (cat !== "전체" && k.category !== cat) return false;
      if (agency !== "전체" && k.agency !== agency) return false;
      if (stateFilter === "원고O/발행O" && !(k.has_article && k.published_url)) return false;
      if (stateFilter === "원고O/발행X" && !(k.has_article && !k.published_url)) return false;
      if (stateFilter === "원고X/발행O" && !(!k.has_article && k.published_url)) return false;
      if (stateFilter === "원고X/발행X" && !(!k.has_article && !k.published_url)) return false;
      return true;
    });
  }, [keywords, query, cat, agency, stateFilter]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="키워드 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border border-gray-200 rounded px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-blue-300"
        />

        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none"
        >
          <option>전체</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>

        <select
          value={agency}
          onChange={(e) => setAgency(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none"
        >
          <option>전체</option>
          {Object.keys(AGENCY_LABEL).map((a) => (
            <option key={a} value={a}>{AGENCY_LABEL[a]}</option>
          ))}
        </select>

        <div className="flex gap-1 flex-wrap">
          {(["전체", "원고O/발행O", "원고O/발행X", "원고X/발행O", "원고X/발행X"] as const).map((v) => {
            const colorMap: Record<string, string> = {
              "전체": "bg-gray-800 text-white border-gray-800",
              "원고O/발행O": "bg-emerald-600 text-white border-emerald-600",
              "원고O/발행X": "bg-amber-500 text-white border-amber-500",
              "원고X/발행O": "bg-purple-600 text-white border-purple-600",
              "원고X/발행X": "bg-gray-400 text-white border-gray-400",
            };
            return (
              <button
                key={v}
                onClick={() => setStateFilter(v)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  stateFilter === v
                    ? colorMap[v]
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {v}
              </button>
            );
          })}
        </div>

        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} / {keywords.length}건
        </span>
      </div>

      {/* 테이블 */}
      <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
              <th className="text-left px-3 py-2 font-medium w-48">키워드</th>
              <th className="text-left px-3 py-2 font-medium w-20">분류</th>
              <th className="text-left px-3 py-2 font-medium w-24">에이전시</th>
              <th className="text-left px-3 py-2 font-medium">메모</th>
              <th className="text-left px-3 py-2 font-medium w-20">인스타</th>
              <th className="text-center px-3 py-2 font-medium w-14">원고</th>
              <th className="text-center px-3 py-2 font-medium w-14">발행</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => (
              <tr key={k.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-3 py-2 font-medium text-gray-800">{k.keyword}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{k.category}</td>
                <td className="px-3 py-2">
                  {k.agency ? (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${AGENCY_COLOR[k.agency] ?? "bg-gray-100 text-gray-600"}`}>
                      {AGENCY_LABEL[k.agency] ?? k.agency}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs">{k.notes || "—"}</td>
                <td className="px-3 py-2">
                  {k.instagram ? (
                    <a href={k.instagram} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">링크</a>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  {k.has_article
                    ? <span className="text-xs font-medium text-blue-600">✓</span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  {k.published_url ? (
                    <a href={k.published_url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline text-xs font-medium">✓</a>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-400 text-sm">
                  키워드가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
