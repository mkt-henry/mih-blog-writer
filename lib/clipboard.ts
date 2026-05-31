// 브라우저 clipboard 헬퍼.
//
// - copyPlain(text): 일반 텍스트 복사. Clipboard API 실패 시 execCommand fallback.
// - copyRichHtml(html): contentEditable DOM 노드에 렌더링 후 execCommand("copy") → 네이버 글쓰기 Ctrl+V 시 서식·이미지 보존.

export async function copyPlain(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
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

function stripHtml(html: string): string {
  return html
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
}

export async function copyRichHtml(html: string): Promise<void> {
  const plain = stripHtml(html);

  // 1) execCommand approach: bypasses Chrome 127+ ClipboardItem sanitization.
  //    Must call document.body.focus() first — if the preview <iframe> has focus,
  //    execCommand("copy") on the parent document writes nothing to the clipboard.
  const div = document.createElement("div");
  div.contentEditable = "true";
  div.innerHTML = html;
  div.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;pointer-events:none;";
  document.body.appendChild(div);
  try {
    document.body.focus();
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand("copy");
    sel?.removeAllRanges();
    if (ok) return;
  } finally {
    document.body.removeChild(div);
  }

  // 2) ClipboardItem fallback (focus-independent; may be sanitized but beats plain text)
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
    return;
  }

  throw new Error("클립보드 복사를 지원하지 않는 환경입니다.");
}
