import { describe, it, expect } from 'vitest';
import { groupArticlesForKanban, computeKpis, findNeighbor, type ArticleRow, type KanbanGroups } from '@/lib/articles';
import type { AgencySlug } from '@/lib/agencies';

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
      mk({ id: 'p1', agency: 'mih_speaker', person_name: 'A', published_at: null }),
      mk({ id: 'p2', agency: 'mih_speaker', person_name: 'B', published_at: new Date(Date.now() - 86400_000).toISOString() }),
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

  it('projects sibling publication: same person_name published in any agency marks all as published', () => {
    const articles = [
      mk({
        id: 'casting',
        agency: 'mih_casting',
        person_name: '임영웅',
        published_at: '2026-05-19T00:00:00Z',
        published_url: 'https://blog.naver.com/mih_casting/123',
        published_source: 'rss',
      }),
      mk({
        id: 'agency',
        agency: 'mih_agency',
        person_name: '임영웅',
        published_at: null,
        published_url: null,
        published_source: null,
      }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_agency.pool.length).toBe(0);
    expect(grouped.mih_agency.recent.map((a) => a.id)).toEqual(['agency']);
    const projected = grouped.mih_agency.recent[0];
    expect(projected.published_at).toBe('2026-05-19T00:00:00Z');
    expect(projected.published_url).toBe('https://blog.naver.com/mih_casting/123');
    expect(projected.published_source).toBe('rss');
  });

  it('sibling projection does not affect articles whose person_name has no published sibling', () => {
    const articles = [
      mk({ id: 'lonely', agency: 'mih_agency', person_name: '홍길동', published_at: null }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_agency.pool.map((a) => a.id)).toEqual(['lonely']);
  });
});

describe('computeKpis', () => {
  it('counts pool size, today count, this-week count, unmatched flag', () => {
    const todayMid = todayKstIso();
    const articles = [
      mk({ id: 'pool1', agency: 'mih_speaker', person_name: 'A', published_at: null }),
      mk({ id: 'pool2', agency: 'mih_casting', person_name: 'B', published_at: null }),
      mk({ id: 'today1', agency: 'mih_speaker', person_name: 'C', published_at: new Date(Date.parse(todayMid) + 1000).toISOString() }),
      mk({ id: 'week1', agency: 'mih_speaker', person_name: 'D', published_at: new Date(Date.parse(todayMid) - 2 * 86400_000).toISOString() }),
      mk({ id: 'old', agency: 'mih_speaker', person_name: 'E', published_at: new Date(Date.parse(todayMid) - 30 * 86400_000).toISOString() }),
    ];
    const kpis = computeKpis(articles, 3);
    expect(kpis.poolTotal).toBe(2);
    expect(kpis.todayTotal).toBe(1);
    expect(kpis.weekTotal).toBe(2);
    expect(kpis.unmatchedNeedReview).toBe(3);
  });

  it('pool count excludes articles whose person_name has a published sibling', () => {
    const todayMid = todayKstIso();
    const articles = [
      mk({ id: 'casting', agency: 'mih_casting', person_name: '임영웅', published_at: new Date(Date.parse(todayMid) - 86400_000).toISOString() }),
      mk({ id: 'agency', agency: 'mih_agency', person_name: '임영웅', published_at: null }),
      mk({ id: 'lonely', agency: 'mih_speaker', person_name: '홍길동', published_at: null }),
    ];
    const kpis = computeKpis(articles, 0);
    expect(kpis.poolTotal).toBe(1);
  });
});

describe('findNeighbor (모달 순회)', () => {
  function mkGroups(): KanbanGroups {
    const mkA = (id: string, agency: AgencySlug, sec: 'pool' | 'today' | 'recent', extra: Partial<ArticleRow> = {}): ArticleRow => ({
      id, publish_date: '2026-05-21', agency, slug: id, person_name: id,
      title: id, source_path: null, instagram_url: null, category: null, notes: null,
      created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z',
      published_at: sec === 'pool' ? null : '2026-05-22T00:00:00Z',
      published_url: null, published_source: null,
      ...extra,
    });
    return {
      mih_speaker: {
        pool: [mkA('s1', 'mih_speaker', 'pool'), mkA('s2', 'mih_speaker', 'pool'), mkA('s3', 'mih_speaker', 'pool')],
        today: [mkA('s-t1', 'mih_speaker', 'today')],
        recent: [mkA('s-r1', 'mih_speaker', 'recent')],
      },
      mih_casting: { pool: [mkA('c1', 'mih_casting', 'pool')], today: [], recent: [] },
      mih_agency: { pool: [], today: [], recent: [] },
    };
  }

  it('returns the next id within the same agency+section', () => {
    const groups = mkGroups();
    expect(findNeighbor(groups, 's1', 'next')).toBe('s2');
    expect(findNeighbor(groups, 's2', 'next')).toBe('s3');
  });

  it('returns the prev id within the same agency+section', () => {
    const groups = mkGroups();
    expect(findNeighbor(groups, 's3', 'prev')).toBe('s2');
  });

  it('returns null when at the boundary (does not cross sections)', () => {
    const groups = mkGroups();
    expect(findNeighbor(groups, 's3', 'next')).toBe(null);
    expect(findNeighbor(groups, 's1', 'prev')).toBe(null);
  });

  it('returns null when id not found', () => {
    const groups = mkGroups();
    expect(findNeighbor(groups, 'nonexistent', 'next')).toBe(null);
  });

  it('also handles today and recent sections', () => {
    const groups = mkGroups();
    expect(findNeighbor(groups, 's-t1', 'next')).toBe(null);
    expect(findNeighbor(groups, 's-t1', 'prev')).toBe(null);
  });
});
