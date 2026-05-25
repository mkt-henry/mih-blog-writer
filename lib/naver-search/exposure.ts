export const MIH_BLOG_SLUGS = ['mih_speaker', 'mih_casting', 'mih_agency'] as const;

export function isMihExposed(html: string): boolean {
  if (!html) return false;
  return MIH_BLOG_SLUGS.some((s) => html.includes(`blog.naver.com/${s}`));
}
