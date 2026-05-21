"use client";

import { useState } from "react";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

async function copyHtml(html: string): Promise<boolean> {
  try {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([html.replace(/<[^>]+>/g, "")], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return copyText(html);
  }
}

export default function ArticleActions({ title, html }: { title: string; html: string }) {
  const [titleState, setTitleState] = useState<"idle" | "ok" | "fail">("idle");
  const [htmlState, setHtmlState] = useState<"idle" | "ok" | "fail">("idle");

  async function onTitle() {
    const ok = await copyText(title);
    setTitleState(ok ? "ok" : "fail");
    setTimeout(() => setTitleState("idle"), 1500);
  }
  async function onHtml() {
    const ok = await copyHtml(html);
    setHtmlState(ok ? "ok" : "fail");
    setTimeout(() => setHtmlState("idle"), 1500);
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={onTitle} style={secondaryBtn}>
        {titleState === "ok" ? "복사됨" : titleState === "fail" ? "실패" : "제목 복사"}
      </button>
      <button onClick={onHtml} style={primaryBtn}>
        {htmlState === "ok" ? "복사됨" : htmlState === "fail" ? "실패" : "본문 복사"}
      </button>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  border: "1px solid #1565C0",
  background: "#1565C0",
  color: "#fff",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};
const secondaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  border: "1px solid #1565C0",
  background: "#fff",
  color: "#1565C0",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};
