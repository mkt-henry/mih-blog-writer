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
          // 휴대폰에서 탭을 오가며 여러 번 열어도 RSS 를 매번 부르지 않게 1분만 묵힌다.
          next: { revalidate: 60 },
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
