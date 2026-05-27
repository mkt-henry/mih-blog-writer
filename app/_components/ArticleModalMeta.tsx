"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { ArticleRow } from "@/lib/articles";

type Props = {
  article: ArticleRow;
  onUpdated: (next: ArticleRow) => void;
  editable: boolean;
};

export default function ArticleModalMeta({ article, onUpdated, editable }: Props) {
  const [instagram, setInstagram] = useState(article.instagram_url ?? "");
  const [category, setCategory] = useState(article.category ?? "");
  const [notes, setNotes] = useState(article.notes ?? "");
  const [publishedUrl, setPublishedUrl] = useState(article.published_url ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setInstagram(article.instagram_url ?? "");
    setCategory(article.category ?? "");
    setNotes(article.notes ?? "");
    setPublishedUrl(article.published_url ?? "");
  }, [article.id, article.instagram_url, article.category, article.notes, article.published_url]);

  const dirty =
    (article.instagram_url ?? "") !== instagram ||
    (article.category ?? "") !== category ||
    (article.notes ?? "") !== notes;

  function saveMeta() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/articles/${article.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instagram_url: instagram || null,
            category: category || null,
            notes,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = (await res.json()) as ArticleRow;
        onUpdated(next);
        toast.success("메타 저장됨");
      } catch (e) {
        toast.error("저장 실패: " + (e as Error).message);
      }
    });
  }

  // base-ui Switch onCheckedChange: (checked: boolean, eventDetails) => void
  function togglePublished(on: boolean) {
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = { set_published: on };
        if (on && publishedUrl) body.published_url = publishedUrl;
        const res = await fetch(`/api/articles/${article.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = (await res.json()) as ArticleRow;
        onUpdated(next);
        toast.success(on ? "발행됨 표시" : "미발행으로 되돌림");
      } catch (e) {
        toast.error("발행 상태 변경 실패: " + (e as Error).message);
      }
    });
  }

  const isPublished = article.published_at !== null;

  return (
    <div className="space-y-4 p-4 overflow-y-auto text-xs">
      <section>
        <Label className="text-[10px] uppercase tracking-wide text-gray-500">발행 정보</Label>
        <div className="text-xs mt-1">{article.agency} · {article.publish_date}</div>
        <div className="text-[10px] text-gray-400 font-mono">slug: {article.slug}</div>
      </section>

      <section className="space-y-2">
        <Label className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center gap-2">
          발행 상태
          {article.published_source === "rss" && <span className="text-[9px] text-green-700">RSS 자동</span>}
          {article.published_source === "manual" && <span className="text-[9px] text-orange-700">수동</span>}
        </Label>
        <div className="flex items-center gap-2">
          <Switch checked={isPublished} disabled={pending || !editable} onCheckedChange={togglePublished} />
          <span className="text-xs">{isPublished ? "발행됨" : "미발행"}</span>
        </div>
        {isPublished && (
          <Input
            value={publishedUrl}
            onChange={(e) => setPublishedUrl(e.target.value)}
            placeholder="발행 URL (선택)"
            className="text-xs"
            disabled={!editable}
          />
        )}
      </section>

      <section className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-gray-500">인스타그램 URL</Label>
        <Input
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          placeholder="https://www.instagram.com/..."
          className={`text-xs ${(article.instagram_url ?? "") !== instagram ? "border-blue-500 bg-blue-50/30" : ""}`}
          disabled={!editable}
        />
      </section>

      <section className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-gray-500">카테고리</Label>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="인물 · 강연 등"
          className={`text-xs ${(article.category ?? "") !== category ? "border-blue-500 bg-blue-50/30" : ""}`}
          disabled={!editable}
        />
      </section>

      <section className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-gray-500">노트</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className={`text-xs ${(article.notes ?? "") !== notes ? "border-blue-500 bg-blue-50/30" : ""}`}
          disabled={!editable}
        />
      </section>

      {editable && (
        <Button onClick={saveMeta} disabled={!dirty || pending} className="w-full" size="sm">
          {pending ? "저장 중…" : dirty ? "저장" : "변경 없음"}
        </Button>
      )}
    </div>
  );
}
