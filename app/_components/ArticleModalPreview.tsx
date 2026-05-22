"use client";

import { useEffect, useState } from "react";
import type { AgencySlug } from "@/lib/agencies";
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";

type Props = { articleId: string; agency: AgencySlug };

export default function ArticleModalPreview({ articleId, agency }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    fetch(`/api/manuscripts/${articleId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const raw = typeof data?.html_content === "string" ? data.html_content : "";
        const card = buildBusinessCardHtml(agency);
        setHtml(mergeWithBusinessCard(raw, card));
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId, agency]);

  if (error) {
    return <div className="p-6 text-red-700 text-sm">미리보기 로드 실패: {error}</div>;
  }
  if (html == null) {
    return <div className="p-6 text-gray-400 text-sm">불러오는 중…</div>;
  }

  const srcDoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
body { margin:0; padding:24px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",Arial,sans-serif; color:#222; background:#fff; line-height:1.6; }
img { max-width:100%; height:auto; }
hr { border:none; border-top:1px solid #e0e0e0; margin:20px 0; }
</style></head><body>${html}</body></html>`;

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      className="w-full h-full bg-white"
      style={{ border: 0 }}
    />
  );
}
