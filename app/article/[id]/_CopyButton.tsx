"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { copyPlain, copyRichHtml } from "@/lib/clipboard";

type Props = {
  title: string;
  htmlBody: string;
};

export default function CopyButton({ title, htmlBody }: Props) {
  const [busy, setBusy] = useState<"title" | "body" | null>(null);

  async function onCopyTitle() {
    setBusy("title");
    try {
      await copyPlain(title);
      toast.success("제목을 복사했어요");
    } catch (e) {
      toast.error("제목 복사 실패: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onCopyBody() {
    setBusy("body");
    try {
      await copyRichHtml(htmlBody);
      toast.success("원고 본문을 복사했어요. 네이버 글쓰기에 Ctrl+V");
    } catch (e) {
      toast.error("본문 복사 실패: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button onClick={onCopyTitle} disabled={busy !== null} size="sm" variant="outline">
        📋 제목 복사
      </Button>
      <Button onClick={onCopyBody} disabled={busy !== null} size="sm">
        📰 원고 복사
      </Button>
    </div>
  );
}
