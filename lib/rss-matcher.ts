export function normalizeTitle(s: string): string {
  return s
    .replace(/[  　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTitleKeyword(rawTitle: string): string | null {
  const title = normalizeTitle(rawTitle);
  const m = title.match(/^\[([^\]]+?)(?:\s+섭외)?\]/);
  return m ? m[1].trim() : null;
}
