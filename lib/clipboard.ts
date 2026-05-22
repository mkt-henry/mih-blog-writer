// 브라우저 clipboard 헬퍼.
//
// - copyPlain(text): 일반 텍스트 복사. Clipboard API 실패 시 execCommand fallback.
// - copyRichHtml(html): text/html + text/plain 동시 쓰기 → 네이버 글쓰기 등에 Ctrl+V 시 서식 보존.

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

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
    return;
  }

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
