import { supabaseAdmin } from '@/lib/supabase';
import { extractUniqueKeywords } from './keywords';
import { isMihExposed } from './exposure';
import { postScreenshotToDiscord } from './discord';
import { launchChromium } from './chromium';

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
}): Promise<JobSummary> {
  const date = getKstYesterday();

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('articles')
    .select('title, agency, person_name, published_url')
    .eq('publish_date', date)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`articles select failed: ${error.message}`);

  const articles = data ?? [];
  const keywords = extractUniqueKeywords(
    articles.map((a) => ({ title: a.title as string, person_name: (a.person_name as string | null) ?? '' })),
  );

  if (keywords.length === 0) {
    return { ok: true, date, total: 0, posted: 0, skipped: 0, errors: [] };
  }

  const errors: string[] = [];
  let posted = 0;
  let skipped = 0;

  const browser = await launchChromium();
  try {
    for (const keyword of keywords) {
      const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
      const page = await browser.newPage();
      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 15_000 });
        const html = await page.content();
        if (!isMihExposed(html)) {
          skipped += 1;
          continue;
        }
        const png = await page.screenshot({ type: 'png', fullPage: false });
        await postScreenshotToDiscord({
          webhookUrl: args.webhookUrl,
          keyword,
          searchUrl,
          pngBuffer: png,
        });
        posted += 1;
      } catch (e) {
        errors.push(`${keyword}: ${(e as Error).message}`.slice(0, 200));
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return { ok: true, date, total: keywords.length, posted, skipped, errors };
}
