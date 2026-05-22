"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { ArticleRow } from "@/lib/articles";
import { copyPlain, copyRichHtml } from "@/lib/clipboard";
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";

type Variant = "pool" | "published" | "recent";
type Props = { article: ArticleRow; variant: Variant };

function kstTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
}

async function fetchHtml(id: string): Promise<string> {
  const res = await fetch(`/api/manuscripts/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data?.html_content !== "string") throw new Error("html_content 없음");
  return data.html_content;
}

export default function ArticleCard({ article, variant }: Props) {
  const [busy, setBusy] = useState<"title" | "body" | null>(null);
  const opacityCls = variant === "recent" ? "opacity-70" : variant === "published" ? "opacity-90 bg-gray-50" : "";
  const missingInsta = article.instagram_url == null;

  async function onCopyTitle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy("title");
    try {
      await copyPlain(article.title);
      toast.success(`제목 복사: ${article.person_name}`);
    } catch (err) {
      toast.error("제목 복사 실패: " + (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onCopyBody(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy("body");
    try {
      const raw = await fetchHtml(article.id);
      const card = buildBusinessCardHtml(article.agency);
      const merged = mergeWithBusinessCard(raw, card);
      await copyRichHtml(merged);
      toast.success(`원고 복사: ${article.person_name}. 네이버 글쓰기에 Ctrl+V`);
    } catch (err) {
      toast.error("원고 복사 실패: " + (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Link
      href={`/article/${article.id}`}
      className={`group relative block border border-[color:var(--color-border)] rounded mb-1 px-2 py-1.5 hover:border-[color:var(--color-primary)] hover:shadow-sm transition ${opacityCls}`}
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
      <div className="flex items-center justify-between mt-0.5">
        <div className="text-[9px] text-[color:var(--color-text-muted)]">
          {variant === "pool" && `${article.created_at.slice(0, 10)} 추가`}
          {variant === "published" && `${article.agency} RSS 매칭`}
          {variant === "recent" && article.published_at && `${article.published_at.slice(0, 10)} 발행`}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onCopyTitle}
            disabled={busy !== null}
            title="제목 복사"
            className="text-[9px] px-1.5 py-0.5 rounded border border-[color:var(--color-border)] bg-white text-gray-700 hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)] disabled:opacity-50"
          >
            {busy === "title" ? "…" : "📋 제목"}
          </button>
          <button
            type="button"
            onClick={onCopyBody}
            disabled={busy !== null}
            title="본문 복사 (명함 합성됨)"
            className="text-[9px] px-1.5 py-0.5 rounded border border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "body" ? "…" : "📰 본문"}
          </button>
        </div>
      </div>
    </Link>
  );
}
