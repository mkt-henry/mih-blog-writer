import { parseSerp } from './exposure';
import { postScreenshotToDiscord } from './discord';
import { fetchNaverSearchHtml, buildNaverSearchUrl } from './search';
import { fetchNaverSearchScreenshotPng } from './screenshot';
import { targetDates, groupByQuery, kstDateMinus, type PublishedArticle } from './schedule';
import { fetchArticlesPublishedOn, recordSerpChecks } from './serp-log';

export { toSearchQuery } from './schedule';

export type JobSummary = {
  ok: true;
  dates: string[];
  groups: number;
  articles: number;
  indexed: number;
  missed: number;
  posted: number;
  errors: string[];
};

/** maxDuration 300초 안에 끝내기 위한 동시 실행 수. 검색 1건은 1~2초다. */
const CONCURRENCY = 3;

async function inPool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
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

  let indexed = 0;
  let missed = 0;
  let posted = 0;

  await inPool(groups, async (g) => {
    const searchUrl = buildNaverSearchUrl(g.query);
    try {
      const result = parseSerp(await fetchNaverSearchHtml(g.query));
      if (result.indexed) indexed += 1;
      else missed += 1;

      await recordSerpChecks({ articleIds: g.articleIds, query: g.query, result });

      const isDPlus1 = g.articleIds.some((id) => dPlus1Ids.has(id));
      if (result.indexed && isDPlus1) {
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
    indexed,
    missed,
    posted,
    errors,
  };
}
