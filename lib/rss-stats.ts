import type { AgencySlug } from '@/lib/agencies';

export type RssStatsArticle = {
  id: string;
  agency: AgencySlug;
  created_at: string;
  published_at: string | null;
};

export type DailyBucket = {
  date: string;
  mih_speaker: number;
  mih_casting: number;
  mih_agency: number;
  kyh620303: number;
};

export type AgencyAggregate = {
  periodTotal: number;
  avgPerDay: number;
};

export type RssStats = {
  totalPublished: number;
  goalPercent: number;
  zeroDaysCount: number;
  unmatchedCount: number;
  daily: DailyBucket[];
  byAgency: Record<AgencySlug, AgencyAggregate>;
};

export type RssStatsInput = {
  range: { startMs: number; endMs: number };
  articles: RssStatsArticle[];
  unmatchedCount: number;
};

const KST_OFFSET_MS = 9 * 3600_000;
const DAILY_TARGET = 10;

function kstDateString(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function computeRssStats(input: RssStatsInput): RssStats {
  const { range, articles, unmatchedCount } = input;
  const dayCount = Math.round((range.endMs - range.startMs) / 86400_000);
  const target = dayCount * DAILY_TARGET;

  const byDate = new Map<string, DailyBucket>();
  for (let d = 0; d < dayCount; d++) {
    const ms = range.startMs + d * 86400_000;
    const date = kstDateString(ms);
    byDate.set(date, { date, mih_speaker: 0, mih_casting: 0, mih_agency: 0, kyh620303: 0 });
  }

  const byAgency: Record<AgencySlug, AgencyAggregate> = {
    mih_speaker: { periodTotal: 0, avgPerDay: 0 },
    mih_casting: { periodTotal: 0, avgPerDay: 0 },
    mih_agency: { periodTotal: 0, avgPerDay: 0 },
    kyh620303: { periodTotal: 0, avgPerDay: 0 },
  };

  let totalPublished = 0;
  for (const a of articles) {
    if (a.published_at == null) continue;
    const t = Date.parse(a.published_at);
    if (t < range.startMs || t >= range.endMs) continue;
    const date = kstDateString(t);
    const bucket = byDate.get(date);
    if (!bucket) continue;
    bucket[a.agency]++;
    byAgency[a.agency].periodTotal++;
    totalPublished++;
  }

  for (const slug of Object.keys(byAgency) as AgencySlug[]) {
    byAgency[slug].avgPerDay = dayCount > 0 ? +(byAgency[slug].periodTotal / dayCount).toFixed(1) : 0;
  }

  const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const zeroDaysCount = daily.filter((d) => d.mih_speaker + d.mih_casting + d.mih_agency + d.kyh620303 === 0).length;
  const goalPercent = target > 0 ? Math.round((totalPublished / target) * 100) : 0;

  return { totalPublished, goalPercent, zeroDaysCount, unmatchedCount, daily, byAgency };
}
