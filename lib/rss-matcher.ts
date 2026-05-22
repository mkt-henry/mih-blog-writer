export function normalizeTitle(s: string): string {
  return s
    .replace(/[  　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
