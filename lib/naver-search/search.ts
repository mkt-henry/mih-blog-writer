const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * 두 검색면을 모두 잰다.
 *
 * `blog-tab` 은 **색인 여부**를, `pc-total` 은 **통합검색 노출과 순위**를 알려준다.
 * 실측(2026-08-15)에서 오늘 발행한 글이 블로그 탭에는 잡히는데 통합검색에는 없었고,
 * 4월 발행분은 양쪽 다 없었다. 통합검색만 보면 둘이 한 덩어리가 되어
 * "색인이 안 됐다"와 "색인은 됐는데 통합검색에 못 올라갔다"를 구분할 수 없다.
 */
export const SURFACES = ['blog-tab', 'pc-total'] as const;
export type Surface = (typeof SURFACES)[number];

export function buildNaverSearchUrl(keyword: string, surface: Surface = 'pc-total'): string {
  const q = `query=${encodeURIComponent(keyword)}`;
  return surface === 'blog-tab'
    ? `https://search.naver.com/search.naver?ssc=tab.blog.all&${q}`
    : `https://search.naver.com/search.naver?${q}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 연속 요청이 빠르면 네이버가 403 으로 막는다(실측: 74건을 몰아쳤을 때 발생).
 *  한 번 물러섰다 다시 시도한다 — 여기서 포기하면 그 원고의 그날 측정치가 영영 사라진다. */
const RETRY_WAIT_MS = 5_000;

export async function fetchNaverSearchHtml(
  keyword: string,
  surface: Surface = 'pc-total',
  timeoutMs = 12_000,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(buildNaverSearchUrl(keyword, surface), {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return await res.text();
    if (res.status !== 403 || attempt === 1) throw new Error(`naver search HTTP ${res.status}`);
    await sleep(RETRY_WAIT_MS);
  }
  throw new Error('naver search: unreachable');
}
