import { isMihExposed } from './exposure';
import { postScreenshotToDiscord } from './discord';
import { fetchRssKeywordsForDate } from './rss';
import { fetchNaverSearchHtml, buildNaverSearchUrl } from './search';
import { fetchNaverSearchScreenshotPng } from './screenshot';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getKstYesterday(now: Date = new Date()): string {
  const kstYesterday = new Date(now.getTime() + KST_OFFSET_MS - 24 * 60 * 60 * 1000);
  return kstYesterday.toISOString().slice(0, 10);
}

export type JobSummary = {
  ok: true;
  date: string;
  total: number;
  posted: number;
  skipped: number;
  errors: string[];
};

export async function runDailyNaverScreenshotJob(args: {
  webhookUrl: string;
  date?: string;
}): Promise<JobSummary> {
  const date = args.date ?? getKstYesterday();

  const { keywords, errors: rssErrors } = await fetchRssKeywordsForDate(date);
  const errors: string[] = [...rssErrors];

  if (keywords.length === 0) {
    return { ok: true, date, total: 0, posted: 0, skipped: 0, errors };
  }

  let posted = 0;
  let skipped = 0;

  for (const keyword of keywords) {
    const searchUrl = buildNaverSearchUrl(keyword);
    try {
      const html = await fetchNaverSearchHtml(keyword);
      if (!isMihExposed(html)) {
        skipped += 1;
        continue;
      }
      const png = await fetchNaverSearchScreenshotPng(searchUrl);
      await postScreenshotToDiscord({
        webhookUrl: args.webhookUrl,
        keyword,
        searchUrl,
        pngBuffer: png,
      });
      posted += 1;
    } catch (e) {
      errors.push(`${keyword}: ${(e as Error).message}`.slice(0, 200));
    }
  }

  return { ok: true, date, total: keywords.length, posted, skipped, errors };
}
