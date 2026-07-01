"use client";

import { useState } from "react";
import { copyPlain, copyRichHtml } from "@/lib/clipboard";

type Props = {
  articleId: string;
  title: string;
  body: string;
};

// 계정별 공개 피드용 복사 버튼.
// 자동화 셀렉터: data-copy-title / data-copy-body (표준),
// data-copy="title" / data-copy="body" (하위호환) 둘 다 제공한다.
export default function AccountCopyButtons({ articleId, title, body }: Props) {
  const [done, setDone] = useState<"title" | "body" | null>(null);

  async function copy(kind: "title" | "body") {
    try {
      if (kind === "title") await copyPlain(title);
      else await copyRichHtml(body);
      setDone(kind);
      setTimeout(() => setDone((d) => (d === kind ? null : d)), 1500);
    } catch {
      // 자동화가 클립보드를 직접 못 읽는 환경 대비: 실패해도 조용히 무시
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        data-copy="title"
        data-copy-title
        data-post-id={articleId}
        onClick={() => copy("title")}
        className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
      >
        {done === "title" ? "복사됨" : "제목 복사"}
      </button>
      <button
        type="button"
        data-copy="body"
        data-copy-body
        data-post-id={articleId}
        onClick={() => copy("body")}
        className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
      >
        {done === "body" ? "복사됨" : "본문 복사"}
      </button>
    </div>
  );
}
