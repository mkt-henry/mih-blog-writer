import { parseSerp } from './exposure';
import { postScreenshotToDiscord } from './discord';
import { fetchNaverSearchHtml, buildNaverSearchUrl, SURFACES } from './search';
import { fetchNaverSearchScreenshotPng } from './screenshot';
import { targetDates, groupByQuery, kstDateMinus, type PublishedArticle } from './schedule';
import { fetchArticlesPublishedOn, recordSerpChecks } from './serp-log';

export { toSearchQuery } from './schedule';

export type JobSummary = {
  ok: true;
  dates: string[];
  groups: number;
  articles: number;
  /** 블로그 탭에 잡힌 쿼리 수 = 색인은 됐다 */
  indexedBlogTab: number;
  /** 통합검색에 잡힌 쿼리 수 = 실제 노출 */
  exposedTotal: number;
  /** 양쪽 어디에도 없는 쿼리 수 */
  missed: number;
  posted: number;
  errors: string[];
};

/**
 * 동시 실행 수와 배치 간 간격.
 *
 * 3동시 + 무간격으로 74건을 몰아쳤더니 네이버가 403 으로 막았다(2026-08-15 실측).
 * 하루 대상은 그룹 40개 안팎 × 2개 검색면 = 80건 정도이고,
 * 2동시 + 배치당 800ms 면 80 × (약 1초 + 0.8초) / 2 ≈ 75초로 maxDuration 300초 안에 들어온다.
 */
const CONCURRENCY = 2;
const BATCH_GAP_MS = 800;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function inPool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    if (i > 0) await sleep(BATCH_GAP_MS);
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

export async function runDailyNaverScreenshotJob(args: {
  webhookUrl: string;
  date?: string;
}): Promise<JobSummary> {
  const now = new Date();
  // date 파라미터가 오면 그 하루만 본다(수동 재실행용). 없으면 D+1/3/7/14/30 전부.
  const dates = args.date ? [args.date] : targetDates(now);
  const dPlus1 = args.date ?? kstDateMinus(1, now);

  const errors: string[] = [];
  let articles: PublishedArticle[] = [];
  try {
    articles = await fetchArticlesPublishedOn(dates);
  } catch (e) {
    errors.push((e as Error).message.slice(0, 200));
  }

  const groups = groupByQuery(articles);
  // D+1 그룹만 Discord 발송 대상이다. 나머지는 기록만 한다.
  const dPlus1Ids = new Set(articles.filter((a) => a.publish_date === dPlus1).map((a) => a.id));

  let indexedBlogTab = 0;
  let exposedTotal = 0;
  let missed = 0;
  let posted = 0;

  await inPool(groups, async (g) => {
    try {
      // 두 검색면을 각각 재서 각각 기록한다. 색인 실패와 통합검색 진입 실패는 원인이 다르다.
      const hits: Record<string, boolean> = {};
      for (const surface of SURFACES) {
        const result = parseSerp(await fetchNaverSearchHtml(g.query, surface));
        hits[surface] = result.indexed;
        await recordSerpChecks({ articleIds: g.articleIds, query: g.query, surface, result });
      }
      if (hits['blog-tab']) indexedBlogTab += 1;
      if (hits['pc-total']) exposedTotal += 1;
      if (!hits['blog-tab'] && !hits['pc-total']) missed += 1;

      // Discord 발송은 종전과 같다 — D+1 이면서 통합검색에 노출된 건에만 보낸다.
      const isDPlus1 = g.articleIds.some((id) => dPlus1Ids.has(id));
      if (hits['pc-total'] && isDPlus1) {
        const searchUrl = buildNaverSearchUrl(g.query);
        const png = await fetchNaverSearchScreenshotPng(searchUrl);
        await postScreenshotToDiscord({
          webhookUrl: args.webhookUrl,
          keyword: g.query,
          searchUrl,
          pngBuffer: png,
        });
        posted += 1;
      }
    } catch (e) {
      errors.push(`${g.query}: ${(e as Error).message}`.slice(0, 200));
    }
  });

  return {
    ok: true,
    dates,
    groups: groups.length,
    articles: articles.length,
    indexedBlogTab,
    exposedTotal,
    missed,
    posted,
    errors,
  };
}
