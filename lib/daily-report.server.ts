// server-only: 서버에서만 부른다(네이버 RSS 를 직접 받는다).
import { REPORT_AGENCIES, REPORT_SLUGS, parseRss, type RssByAgency } from "./daily-report";

/** 4개 블로그 네이버 RSS 를 동시에 받는다. 실패한 계정은 빈 목록으로 두고 오류 글자를 돌려준다(daily-notify 와 같다). */
export async function fetchAllRss(): Promise<{ rss: RssByAgency; errors: string[] }> {
  const rss: RssByAgency = {};
  const errors: string[] = [];
  await Promise.all(
    REPORT_SLUGS.map(async (slug) => {
      try {
        const res = await fetch(`https://rss.blog.naver.com/${REPORT_AGENCIES[slug].blog}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MIH-Notifier/1.0)" },
          signal: AbortSignal.timeout(12_000),
          // 매번 새로 받는다. revalidate 를 걸면 오래 안 연 뒤 첫 화면이 묵은 RSS 를 보여 준다
          // (stale-while-revalidate — 2026-10-24 20:50 발행분이 21:14 첫 화면에 빠져 8건으로 보였다).
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        rss[slug] = parseRss(await res.text());
      } catch (e) {
        rss[slug] = [];
        errors.push(`${REPORT_AGENCIES[slug].label}: ${(e as Error).message}`);
      }
    }),
  );
  return { rss, errors };
}
