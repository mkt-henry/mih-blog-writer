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
  // Chrome 127+ sanitizes text/html written via ClipboardItem (strips styles, images).
  // execCommand("copy") on a contentEditable DOM node bypasses sanitization and
  // preserves full rich-text structure when pasted into Naver Smart Editor.
  const div = document.createElement("div");
  div.contentEditable = "true";
  div.innerHTML = html;
  // off-screen이지만 overflow 제한 없이 정상 렌더링 → 이미지·표 포함 rich copy 가능
  div.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;pointer-events:none;";
  document.body.appendChild(div);
  try {
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand("copy");
    sel?.removeAllRanges();
    if (!ok) throw new Error("execCommand copy 실패");
  } finally {
    document.body.removeChild(div);
  }
}
