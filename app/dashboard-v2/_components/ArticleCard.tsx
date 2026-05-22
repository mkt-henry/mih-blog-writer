"use client";

import Link from "next/link";
import type { ArticleRow } from "@/lib/articles";

type Variant = "pool" | "published" | "recent";
type Props = { article: ArticleRow; variant: Variant };

function kstTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
}

export default function ArticleCard({ article, variant }: Props) {
  const opacityCls = variant === "recent" ? "opacity-70" : variant === "published" ? "opacity-90 bg-gray-50" : "";
  const missingInsta = article.instagram_url == null;

  return (
    <Link
      href={`/articles/${article.id}`}
      className={`block border border-[color:var(--color-border)] rounded mb-1 px-2 py-1.5 hover:border-[color:var(--color-primary)] hover:shadow-sm transition ${opacityCls}`}
    >
      <div className="flex items-center gap-1.5">
        <div className="font-semibold text-[11px] text-gray-900 truncate flex-1">{article.person_name}</div>
        {missingInsta && variant === "pool" && (
          <span className="text-[8px] bg-[color:var(--color-danger)] text-white px-1 rounded">인스타 ✕</span>
        )}
        {variant === "published" && article.published_at && (
          <span className="text-[8px] text-[color:var(--color-agency)] font-semibold">{kstTime(article.published_at)}</span>
        )}
      </div>
      <div className="text-[9px] text-[color:var(--color-text-muted)] mt-0.5">
        {variant === "pool" && `${article.created_at.slice(0, 10)} 추가`}
        {variant === "published" && `${article.agency} RSS 매칭`}
        {variant === "recent" && article.published_at && `${article.published_at.slice(0, 10)} 발행`}
      </div>
    </Link>
  );
}
