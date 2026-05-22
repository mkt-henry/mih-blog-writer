import { describe, it, expect } from 'vitest';
import { groupArticlesForKanban, computeKpis, type ArticleRow } from '@/lib/articles';

function mk(over: Partial<ArticleRow>): ArticleRow {
  return {
    id: 'a',
    publish_date: '2026-05-21',
    agency: 'mih_speaker',
    slug: 'hong',
    person_name: '홍길동',
    title: '[홍길동 섭외] ...',
    source_path: null,
    instagram_url: null,
    category: null,
    notes: null,
    created_at: '2026-05-21T00:00:00Z',
    updated_at: '2026-05-21T00:00:00Z',
    published_at: null,
    published_url: null,
    published_source: null,
    ...over,
  };
}

const KST_OFFSET_MS = 9 * 3600_000;
const todayKstIso = () => {
  const now = Date.now();
  const kstMidnight = Math.floor((now + KST_OFFSET_MS) / 86400_000) * 86400_000 - KST_OFFSET_MS;
  return new Date(kstMidnight).toISOString();
};

describe('groupArticlesForKanban', () => {
  it('separates pool (unpublished) from published, by agency', () => {
    const articles = [
      mk({ id: 'p1', agency: 'mih_speaker', published_at: null }),
      mk({ id: 'p2', agency: 'mih_speaker', published_at: new Date(Date.now() - 86400_000).toISOString() }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_speaker.pool.map((a) => a.id)).toEqual(['p1']);
    expect(grouped.mih_speaker.recent.map((a) => a.id)).toEqual(['p2']);
    expect(grouped.mih_speaker.today.length).toBe(0);
  });

  it('classifies today vs recent based on KST midnight', () => {
    const todayMid = todayKstIso();
    const articles = [
      mk({ id: 't', agency: 'mih_speaker', published_at: todayMid }),
      mk({ id: 'r', agency: 'mih_speaker', published_at: new Date(Date.parse(todayMid) - 1000).toISOString() }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_speaker.today.map((a) => a.id)).toEqual(['t']);
    expect(grouped.mih_speaker.recent.map((a) => a.id)).toEqual(['r']);
  });

  it('pool is sorted FIFO (oldest created_at first)', () => {
    const articles = [
      mk({ id: 'new', agency: 'mih_casting', created_at: '2026-05-21T00:00:00Z' }),
      mk({ id: 'old', agency: 'mih_casting', created_at: '2026-05-10T00:00:00Z' }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_casting.pool.map((a) => a.id)).toEqual(['old', 'new']);
  });

  it('today is sorted by published_at ASC', () => {
    const todayMid = todayKstIso();
    const articles = [
      mk({ id: 'late', agency: 'mih_agency', published_at: new Date(Date.parse(todayMid) + 11 * 3600_000).toISOString() }),
      mk({ id: 'early', agency: 'mih_agency', published_at: new Date(Date.parse(todayMid) + 9 * 3600_000).toISOString() }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_agency.today.map((a) => a.id)).toEqual(['early', 'late']);
  });

  it('recent is sorted by published_at DESC (most recent first)', () => {
    const articles = [
      mk({ id: 'old', agency: 'mih_agency', published_at: '2026-04-01T00:00:00Z' }),
      mk({ id: 'newer', agency: 'mih_agency', published_at: '2026-05-15T00:00:00Z' }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_agency.recent.map((a) => a.id)).toEqual(['newer', 'old']);
  });
});

describe('computeKpis', () => {
  it('counts pool size, today count, this-week count, unmatched flag', () => {
    const todayMid = todayKstIso();
    const articles = [
      mk({ id: 'pool1', agency: 'mih_speaker', published_at: null }),
      mk({ id: 'pool2', agency: 'mih_casting', published_at: null }),
      mk({ id: 'today1', agency: 'mih_speaker', published_at: new Date(Date.parse(todayMid) + 1000).toISOString() }),
      mk({ id: 'week1', agency: 'mih_speaker', published_at: new Date(Date.parse(todayMid) - 2 * 86400_000).toISOString() }),
      mk({ id: 'old', agency: 'mih_speaker', published_at: new Date(Date.parse(todayMid) - 30 * 86400_000).toISOString() }),
    ];
    const kpis = computeKpis(articles, 3);
    expect(kpis.poolTotal).toBe(2);
    expect(kpis.todayTotal).toBe(1);
    expect(kpis.weekTotal).toBe(2);
    expect(kpis.unmatchedNeedReview).toBe(3);
  });
});
