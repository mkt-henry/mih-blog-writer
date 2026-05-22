"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  title: string;
  htmlBody: string;
};

async function copyPlain(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

async function copyRichHtml(html: string): Promise<void> {
  // Clipboard API의 ClipboardItem(text/html + text/plain)으로 복사 →
  // 네이버 글쓰기에 Ctrl+V 시 서식 그대로 들어감.
  const plain = html
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
    return;
  }

  // fallback: contentEditable div를 만들어 selection → execCommand('copy')
  const div = document.createElement("div");
  div.contentEditable = "true";
  div.innerHTML = html;
  div.style.position = "fixed";
  div.style.opacity = "0";
  document.body.appendChild(div);
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.execCommand("copy");
  sel?.removeAllRanges();
  document.body.removeChild(div);
}

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
