import { describe, it, expect } from 'vitest';
import { computeRssStats, type RssStatsArticle } from '@/lib/rss-stats';
import type { AgencySlug } from '@/lib/agencies';

function mk(over: Partial<RssStatsArticle>): RssStatsArticle {
  return {
    id: 'a', agency: 'mih_speaker', created_at: '2026-05-01T00:00:00Z',
    published_at: null, ...over,
  };
}

describe('computeRssStats', () => {
  const range = { startMs: Date.parse('2026-05-09T00:00:00+09:00'), endMs: Date.parse('2026-05-23T00:00:00+09:00') };

  it('counts total published in range', () => {
    const stats = computeRssStats({
      range, articles: [
        mk({ id: 'p1', published_at: '2026-05-10T05:00:00+09:00' }),
        mk({ id: 'p2', published_at: '2026-05-12T05:00:00+09:00' }),
        mk({ id: 'out', published_at: '2026-05-08T05:00:00+09:00' }),
      ],
      unmatchedCount: 0,
    });
    expect(stats.totalPublished).toBe(2);
  });

  it('computes daily totals per agency', () => {
    const stats = computeRssStats({
      range, articles: [
        mk({ agency: 'mih_speaker', published_at: '2026-05-10T05:00:00+09:00' }),
        mk({ agency: 'mih_speaker', published_at: '2026-05-10T06:00:00+09:00' }),
        mk({ agency: 'mih_casting', published_at: '2026-05-10T07:00:00+09:00' }),
      ],
      unmatchedCount: 0,
    });
    const may10 = stats.daily.find((d) => d.date === '2026-05-10');
    expect(may10).toBeDefined();
    expect(may10!.mih_speaker).toBe(2);
    expect(may10!.mih_casting).toBe(1);
    expect(may10!.mih_agency).toBe(0);
    expect(may10!.kyh620303).toBe(0);
  });

  it('flags days with zero publish as suspect', () => {
    const stats = computeRssStats({
      range, articles: [mk({ published_at: '2026-05-10T05:00:00+09:00' })],
      unmatchedCount: 0,
    });
    expect(stats.zeroDaysCount).toBeGreaterThan(0);
  });

  it('computes goal achievement percent (10/day target)', () => {
    const articles: RssStatsArticle[] = [];
    for (let i = 0; i < 70; i++) {
      articles.push(mk({ id: `p${i}`, published_at: '2026-05-15T05:00:00+09:00' }));
    }
    const stats = computeRssStats({ range, articles, unmatchedCount: 0 });
    expect(stats.goalPercent).toBe(50);
  });

  it('per-agency aggregate', () => {
    const stats = computeRssStats({
      range, articles: [
        mk({ agency: 'mih_speaker', published_at: '2026-05-10T05:00:00+09:00' }),
        mk({ agency: 'mih_speaker', published_at: '2026-05-11T05:00:00+09:00' }),
        mk({ agency: 'mih_casting', published_at: '2026-05-12T05:00:00+09:00' }),
      ],
      unmatchedCount: 1,
    });
    expect(stats.byAgency.mih_speaker.periodTotal).toBe(2);
    expect(stats.byAgency.mih_casting.periodTotal).toBe(1);
    expect(stats.byAgency.mih_agency.periodTotal).toBe(0);
    expect(stats.byAgency.kyh620303.periodTotal).toBe(0);
  });
});
