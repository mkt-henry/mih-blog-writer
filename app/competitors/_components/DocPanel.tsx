import type { Doc } from "../page";

export default function DocPanel({ doc }: { doc: Doc }) {
  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold leading-snug">
          {doc.title ?? "(제목 없음)"}
        </h3>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
          <span>{doc.blog_id}</span>
          {doc.char_len ? <span>{doc.char_len.toLocaleString()}자</span> : null}
          {doc.is_ours && (
            <span className="px-1.5 py-px rounded bg-emerald-50 text-emerald-700 font-semibold">
              우리 글
            </span>
          )}
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--color-primary)] hover:underline"
          >
            네이버에서 보기 ↗
          </a>
        </div>
      </div>
      {doc.body ? (
        // 수집한 것은 텍스트뿐이다(이미지·표는 안 가져온다). 줄바꿈만 살려 그대로 보여준다.
        <p className="px-4 py-4 text-sm leading-7 text-gray-700 whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
          {doc.body}
        </p>
      ) : (
        <p className="px-4 py-8 text-sm text-gray-500">본문을 받지 못한 글이다.</p>
      )}
    </div>
  );
}
