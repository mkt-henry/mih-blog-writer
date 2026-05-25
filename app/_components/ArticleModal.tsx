"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AGENCIES } from "@/lib/agencies";
import type { ArticleRow } from "@/lib/articles";
import { canEdit, type UserPermissions } from "@/lib/permissions";
import { copyPlain, copyRichHtml } from "@/lib/clipboard";
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";
import ArticleModalMeta from "./ArticleModalMeta";
import ArticleModalPreview from "./ArticleModalPreview";

type MobileTab = "meta" | "preview";

type Props = {
  articleId: string | null;
  onClose: () => void;
  onNeighbor: (direction: "prev" | "next") => void;
  positionLabel?: string;
  perms: UserPermissions;
};

export default function ArticleModal({ articleId, onClose, onNeighbor, positionLabel, perms }: Props) {
  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"title" | "body" | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("preview");

  useEffect(() => {
    if (!articleId) {
      setArticle(null);
      setMobileTab("preview");
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
        className="max-w-[96vw] sm:max-w-[90vw] w-[1200px] h-[90vh] sm:h-[85vh] p-0 overflow-hidden flex flex-col gap-0"
      >
        {loading || !article ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중…</div>
        ) : (
          <>
            {/* ── 헤더 ── */}
            <header className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-gray-400 leading-none mb-0.5">
                  {AGENCIES[article.agency].blogSlug} · {article.publish_date}
                  {positionLabel && <> · {positionLabel}</>}
                </div>
                <h2 className="text-xs sm:text-sm font-bold truncate leading-snug">{article.title}</h2>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button onClick={onCopyTitle} disabled={busy !== null} size="sm" variant="outline" className="text-xs px-2 h-7">
                  <span className="hidden sm:inline">📋 </span>제목
                </Button>
                <Button onClick={onCopyBody} disabled={busy !== null} size="sm" className="text-xs px-2 h-7">
                  <span className="hidden sm:inline">📰 </span>본문
                </Button>
                <Link href={`/article/${article.id}`} target="_blank" rel="noopener">
                  <Button size="sm" variant="outline" className="text-xs px-2 h-7">↗</Button>
                </Link>
                <Button onClick={onClose} size="sm" variant="ghost" className="text-xs px-2 h-7">✕</Button>
              </div>
            </header>

            {/* ── 모바일 탭 바 ── */}
            <div className="sm:hidden flex border-b flex-shrink-0 bg-white">
              {(["meta", "preview"] as MobileTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-2 text-xs font-semibold border-b-2 transition ${
                    mobileTab === tab
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500"
                  }`}
                >
                  {tab === "meta" ? "메타 정보" : "미리보기"}
                </button>
              ))}
            </div>

            {/* ── 바디 ── */}
            <div className="flex-1 overflow-hidden">
              {/* 데스크톱: 2열 */}
              <div className="hidden sm:grid grid-cols-[280px_1fr] h-full overflow-hidden">
                <aside className="border-r overflow-y-auto bg-gray-50/50">
                  <ArticleModalMeta article={article} onUpdated={(next) => setArticle(next)} editable={canEdit(perms, article.agency)} />
                </aside>
                <main className="overflow-hidden">
                  <ArticleModalPreview articleId={article.id} agency={article.agency} />
                </main>
              </div>
              {/* 모바일: 탭 단일 패널 */}
              <div className="sm:hidden h-full overflow-hidden">
                {mobileTab === "meta" ? (
                  <div className="h-full overflow-y-auto bg-gray-50/50">
                    <ArticleModalMeta article={article} onUpdated={(next) => setArticle(next)} editable={canEdit(perms, article.agency)} />
                  </div>
                ) : (
                  <ArticleModalPreview articleId={article.id} agency={article.agency} />
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
