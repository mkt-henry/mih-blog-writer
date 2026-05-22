"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AGENCIES } from "@/lib/agencies";
import type { ArticleRow } from "@/lib/articles";
import { copyPlain, copyRichHtml } from "@/lib/clipboard";
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";
import ArticleModalMeta from "./ArticleModalMeta";
import ArticleModalPreview from "./ArticleModalPreview";

type Props = {
  articleId: string | null;
  onClose: () => void;
  onNeighbor: (direction: "prev" | "next") => void;
  positionLabel?: string;
};

export default function ArticleModal({ articleId, onClose, onNeighbor, positionLabel }: Props) {
  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"title" | "body" | null>(null);

  useEffect(() => {
    if (!articleId) {
      setArticle(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/articles/${articleId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setArticle(data as ArticleRow);
      })
      .catch(() => {
        if (!cancelled) setArticle(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  useEffect(() => {
    if (!articleId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") onNeighbor("prev");
      if (e.key === "ArrowRight") onNeighbor("next");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [articleId, onNeighbor]);

  async function onCopyTitle() {
    if (!article) return;
    setBusy("title");
    try {
      await copyPlain(article.title);
      toast.success("제목 복사");
    } finally {
      setBusy(null);
    }
  }

  async function onCopyBody() {
    if (!article) return;
    setBusy("body");
    try {
      const res = await fetch(`/api/manuscripts/${article.id}`, { cache: "no-store" });
      const data = await res.json();
      const raw = typeof data?.html_content === "string" ? data.html_content : "";
      const merged = mergeWithBusinessCard(raw, buildBusinessCardHtml(article.agency));
      await copyRichHtml(merged);
      toast.success("원고 복사 — Ctrl+V");
    } catch (e) {
      toast.error("복사 실패: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // base-ui Dialog onOpenChange: (open: boolean, eventDetails) => void
  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  return (
    <Dialog open={articleId !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[90vw] w-[1200px] h-[85vh] p-0 overflow-hidden flex flex-col gap-0"
      >
        {loading || !article ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중…</div>
        ) : (
          <>
            <header className="flex items-start gap-3 px-4 py-3 border-b">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-400 mb-0.5">
                  {AGENCIES[article.agency].blogSlug} · {article.publish_date}
                  {positionLabel && <> · {positionLabel}</>}
                </div>
                <h2 className="text-sm font-bold truncate">{article.title}</h2>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button onClick={onCopyTitle} disabled={busy !== null} size="sm" variant="outline">📋 제목</Button>
                <Button onClick={onCopyBody} disabled={busy !== null} size="sm">📰 본문</Button>
                <Link href={`/article/${article.id}`} target="_blank" rel="noopener">
                  <Button size="sm" variant="outline">↗ 열기</Button>
                </Link>
                <Button onClick={onClose} size="sm" variant="ghost">✕</Button>
              </div>
            </header>
            <div className="flex-1 grid grid-cols-[280px_1fr] overflow-hidden">
              <aside className="border-r overflow-y-auto bg-gray-50/50">
                <ArticleModalMeta article={article} onUpdated={(next) => setArticle(next)} />
              </aside>
              <main className="overflow-hidden">
                <ArticleModalPreview articleId={article.id} agency={article.agency} />
              </main>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
