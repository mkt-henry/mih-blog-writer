import Link from "next/link";
import type { QueryHit } from "../page";

type Props = { queries: QueryHit[]; term: string; active: string; limit: number };

export default function QueryList({ queries, term, active, limit }: Props) {
  return (
    <aside className="bg-white border border-[color:var(--color-border)] rounded-lg overflow-hidden self-start">
      <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <h2 className="text-sm font-bold flex-1">검색어</h2>
        <span className="text-xs text-gray-400">{queries.length}개</span>
      </div>
      {queries.length === 0 ? (
        <p className="px-3 py-6 text-xs text-gray-500">
          {term ? "일치하는 검색어가 없다." : "검색어를 입력해라."}
        </p>
      ) : (
        <ul className="max-h-[70vh] overflow-y-auto divide-y divide-gray-50">
          {queries.map((q) => {
            const on = q.query === active;
            return (
              <li key={q.query}>
                <Link
                  href={`/competitors?${new URLSearchParams({ s: term, q: q.query })}`}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    on
                      ? "bg-blue-50 text-[color:var(--color-primary)] font-semibold"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex-1 truncate">{q.query}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{q.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {queries.length >= limit && (
        <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100">
          {limit}개까지만 보여준다. 검색어를 좁혀라.
        </p>
      )}
    </aside>
  );
}
