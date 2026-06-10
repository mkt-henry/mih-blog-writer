"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";

export type Keyword = {
  id: string;
  keyword: string;
  category: string;
  notes: string | null;
  instagram: string | null;
  agency: string | null;
  published_url: string | null;
  has_article: boolean;
  article_id: string | null;
  article_title: string | null;
  created_at: string;
};

type Props = {
  keywords: Keyword[];
  categories: string[];
  isEditor: boolean;
  visibleColumns: string[] | null; // null = 전체(기존 동작), 배열 = 키워드 전용 컬럼셋
};

/* ─── 원고 모달 ─── */
type ArticleData = { title: string; html_content: string };

function ArticleModal({ articleId, onClose }: { articleId: string; onClose: () => void }) {
  const [data, setData] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/articles/${articleId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [articleId]);

  const copy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} 복사 완료`));
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[800px] max-w-[95vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
            ) : (
              <p className="text-sm font-semibold text-gray-800 truncate">{data?.title}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {data && (
              <>
                <button
                  onClick={() => copy(data.title, "제목")}
                  className="px-2.5 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                >
                  제목 복사
                </button>
                <button
                  onClick={() => copy(data.html_content, "본문")}
                  className="px-2.5 py-1 text-xs rounded bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
                >
                  본문 복사
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="ml-1 text-gray-400 hover:text-gray-700 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 본문 미리보기 */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
              ))}
            </div>
          ) : data ? (
            <div
              className="prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: data.html_content }}
            />
          ) : (
            <p className="text-sm text-gray-400">원고를 불러올 수 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── 메인 컴포넌트 ─── */
export default function KeywordClient({ keywords, categories, isEditor, visibleColumns }: Props) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("전체");
  const [agencyFilter, setAgencyFilter] = useState("전체");
  const [stateFilter, setStateFilter] = useState<"전체" | "원고O/발행O" | "원고O/발행X" | "원고X/발행O" | "원고X/발행X">("전체");
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const copyBody = useCallback(async (articleId: string) => {
    setCopyingId(articleId);
    try {
      const res = await fetch(`/api/articles/${articleId}`);
      const d = await res.json();
      await navigator.clipboard.writeText(d.html_content);
      toast.success("본문 복사 완료");
    } catch {
      toast.error("복사 실패");
    } finally {
      setCopyingId(null);
    }
  }, []);

  // visibleColumns=null → 기존 규칙(원고는 isEditor일 때). 배열이면 그 컬럼만(원고 영구 제외).
  const show = (col: string): boolean => {
    if (col === "article") return visibleColumns === null && isEditor;
    if (visibleColumns === null) return true;
    return visibleColumns.includes(col);
  };
  const bodyCols =
    1 + // # 항상
    ["keyword", "search", "article", "category", "agency", "published_url", "instagram", "notes"].filter(show).length;

  const agencies = useMemo(
    () => [...new Set(keywords.map((k) => k.agency).filter(Boolean) as string[])].sort(),
    [keywords],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keywords.filter((k) => {
      if (q && !k.keyword.toLowerCase().includes(q)) return false;
      if (cat !== "전체" && k.category !== cat) return false;
      if (agencyFilter !== "전체" && k.agency !== agencyFilter) return false;
      if (!isEditor) return true;
      if (stateFilter === "원고O/발행O" && !(k.has_article && k.published_url)) return false;
      if (stateFilter === "원고O/발행X" && !(k.has_article && !k.published_url)) return false;
      if (stateFilter === "원고X/발행O" && !(!k.has_article && k.published_url)) return false;
      if (stateFilter === "원고X/발행X" && !(!k.has_article && !k.published_url)) return false;
      return true;
    });
  }, [keywords, query, cat, agencyFilter, stateFilter, isEditor]);

  return (
    <>
      <div className="p-4 flex flex-col gap-3">

        {/* 필터 */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 px-3 text-sm border border-gray-200 rounded-md w-44 focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="h-8 px-2 text-sm border border-gray-200 rounded-md focus:outline-none"
          >
            <option>전체</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
            className="h-8 px-2 text-sm border border-gray-200 rounded-md focus:outline-none"
          >
            <option>전체</option>
            {agencies.map((a) => <option key={a}>{a}</option>)}
          </select>

          {isEditor && (
            <div className="flex gap-1">
              {(["전체", "원고O/발행O", "원고O/발행X", "원고X/발행O", "원고X/발행X"] as const).map((v) => {
                const active: Record<string, string> = {
                  "전체":        "bg-gray-700 text-white",
                  "원고O/발행O": "bg-emerald-600 text-white",
                  "원고O/발행X": "bg-amber-500 text-white",
                  "원고X/발행O": "bg-purple-600 text-white",
                  "원고X/발행X": "bg-gray-400 text-white",
                };
                return (
                  <button
                    key={v}
                    onClick={() => setStateFilter(v)}
                    className={`h-8 px-2.5 text-xs rounded-md border transition-colors ${
                      stateFilter === v ? active[v] : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">{filtered.length} / {keywords.length}건</span>
            <button
              onClick={() => {
                const url = `${window.location.origin}/share/keywords`;
                navigator.clipboard.writeText(url).then(() => toast.success("공유 URL 복사 완료"));
              }}
              className="h-8 px-3 text-xs rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              공유 URL 복사
            </button>
          </div>
        </div>

        {/* 테이블 */}
        <div className="rounded-lg border border-gray-100 overflow-x-auto bg-white">
          <table className="w-full text-sm">
            <colgroup>
              <col style={{ width: "2rem" }} />
              {show("keyword") && <col style={{ width: "1%" }} />}
              {show("search") && <col style={{ width: "5rem" }} />}
              {show("article") && <col style={{ width: "11rem" }} />}
              {show("category") && <col style={{ width: "5rem" }} />}
              {show("agency") && <col style={{ width: "8rem" }} />}
              {show("instagram") && <col style={{ width: "12rem" }} />}
              {show("notes") && <col style={{ width: "12rem" }} />}
              {show("published_url") && <col />}
            </colgroup>
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
                <th className="px-3 py-1.5 text-right font-medium">#</th>
                {show("keyword") && <th className="px-3 py-1.5 text-left font-medium">키워드</th>}
                {show("search") && <th className="px-3 py-1.5 text-left font-medium">검색</th>}
                {show("article") && <th className="px-3 py-1.5 text-left font-medium">원고</th>}
                {show("category") && <th className="px-3 py-1.5 text-left font-medium">분류</th>}
                {show("agency") && <th className="px-3 py-1.5 text-left font-medium">계정</th>}
                {show("instagram") && <th className="px-3 py-1.5 text-left font-medium">인스타그램</th>}
                {show("notes") && <th className="px-3 py-1.5 text-left font-medium">메모</th>}
                {show("published_url") && <th className="px-3 py-1.5 text-left font-medium">발행 URL</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((k, idx) => (
                <tr key={k.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-3 py-1 text-right text-xs text-gray-300 tabular-nums">{idx + 1}</td>
                  {show("keyword") && (
                    <td className="px-3 py-1 font-medium text-gray-800 whitespace-nowrap">{k.keyword}</td>
                  )}
                  {show("search") && (
                    <td className="px-3 py-1">
                      <a
                        href={`https://search.naver.com/search.naver?query=${encodeURIComponent(k.keyword + " 섭외")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors whitespace-nowrap"
                      >
                        검색 ↗
                      </a>
                    </td>
                  )}
                  {show("article") && (
                    <td className="px-3 py-1">
                      {k.article_id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setOpenArticleId(k.article_id!)}
                            className="px-2.5 py-1 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            보기
                          </button>
                          <button
                            onClick={() => navigator.clipboard.writeText(k.article_title ?? "").then(() => toast.success("제목 복사 완료"))}
                            className="px-2.5 py-1 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            제목
                          </button>
                          <button
                            onClick={() => copyBody(k.article_id!)}
                            disabled={copyingId === k.article_id}
                            className="px-2.5 py-1 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50"
                          >
                            {copyingId === k.article_id ? "…" : "본문"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-200 text-xs">—</span>
                      )}
                    </td>
                  )}
                  {show("category") && (
                    <td className="px-3 py-1 text-xs text-gray-400 whitespace-nowrap">{k.category}</td>
                  )}
                  {show("agency") && (
                    <td className="px-3 py-1 text-xs text-gray-400 font-mono whitespace-nowrap">{k.agency ?? ""}</td>
                  )}
                  {show("instagram") && (
                    <td className="px-3 py-1 text-xs">
                      {k.instagram ? (
                        <a href={k.instagram} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate block" title={k.instagram}>
                          {k.instagram.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                  )}
                  {show("notes") && (
                    <td className="px-3 py-1 text-xs text-gray-500 whitespace-pre-wrap">{k.notes ?? ""}</td>
                  )}
                  {show("published_url") && (
                    <td className="px-3 py-1">
                      {k.published_url ? (
                        <a
                          href={k.published_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-emerald-600 hover:underline truncate block"
                          title={k.published_url}
                        >
                          {k.published_url.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        <span className="text-gray-200 text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={bodyCols} className="py-10 text-center text-sm text-gray-300">
                    키워드가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {openArticleId && (
        <ArticleModal articleId={openArticleId} onClose={() => setOpenArticleId(null)} />
      )}
    </>
  );
}
