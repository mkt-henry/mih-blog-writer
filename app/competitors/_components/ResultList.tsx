import Link from "next/link";
import type { Doc, Ranked } from "../page";

type Props = {
  query: string;
  term: string;
  ranked: Ranked[];
  titleHits: Doc[];
  activeDoc: string;
};

function Row({
  href,
  rank,
  doc,
  active,
}: {
  href: string;
  rank?: number;
  doc: Doc;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex items-start gap-3 px-4 py-2.5 transition-colors ${
          active ? "bg-blue-50" : "hover:bg-gray-50"
        }`}
      >
        {rank !== undefined && (
          <span
            className={`shrink-0 w-6 h-6 mt-0.5 rounded flex items-center justify-center text-[11px] font-bold ${
              rank <= 3
                ? "bg-[color:var(--color-primary)] text-white"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {rank}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-gray-800 leading-snug line-clamp-2">
            {doc.title ?? <span className="text-gray-400">(제목 없음 · 본문 미수집)</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
            <span className="truncate">{doc.blog_id ?? "?"}</span>
            {doc.char_len ? <span>{doc.char_len.toLocaleString()}자</span> : null}
            {doc.is_ours && (
              <span className="px-1.5 py-px rounded bg-emerald-50 text-emerald-700 font-semibold">
                우리 글
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function ResultList({ query, term, ranked, titleHits, activeDoc }: Props) {
  const showing = query ? ranked : titleHits;
  const heading = query ? `"${query}" 상위 노출` : term ? `제목에 "${term}"` : "경쟁 글";

  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <h2 className="text-sm font-bold flex-1 truncate">{heading}</h2>
        <span className="text-xs text-gray-400 shrink-0">{showing.length}건</span>
      </div>

      {showing.length === 0 ? (
        <p className="px-4 py-8 text-sm text-gray-500">
          {query
            ? "이 검색어는 수집 당시 결과가 없었다."
            : term
              ? "일치하는 글이 없다. 왼쪽에서 검색어를 골라도 된다."
              : "인물명으로 검색하거나 왼쪽에서 검색어를 골라라."}
        </p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {showing.map((d) => (
            <Row
              key={d.url}
              href={`/competitors?${new URLSearchParams({ s: term, q: query, doc: d.url })}`}
              rank={"rank" in d ? (d as Ranked).rank : undefined}
              doc={d}
              active={d.url === activeDoc}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
