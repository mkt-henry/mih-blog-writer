import { describe, it, expect } from 'vitest';
import { normalizeTitle, extractTitleKeyword, matchRssItem, type ArticleCandidate, type RssItem } from '@/lib/rss-matcher';

function mkArticle(over: Partial<ArticleCandidate>): ArticleCandidate {
  return {
    id: 'a1',
    person_name: '홍길동',
    slug: 'hong',
    title: '[홍길동 섭외] 기업 강연',
    agency: 'mih_speaker',
    created_at: '2026-05-20T00:00:00Z',
    published_at: null,
    ...over,
  };
}

describe('normalizeTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeTitle('  [홍길동  섭외]   강연 ')).toBe('[홍길동 섭외] 강연');
  });

  it('replaces non-breaking spaces with normal space', () => {
    expect(normalizeTitle('[홍길동 섭외] 강연')).toBe('[홍길동 섭외] 강연');
  });

  it('collapses full-width spaces (U+3000) to normal space', () => {
    expect(normalizeTitle('[홍길동　섭외]　강연')).toBe('[홍길동 섭외] 강연');
  });
});

describe('extractTitleKeyword', () => {
  it('extracts keyword from "[이름 섭외] ..." pattern', () => {
    expect(extractTitleKeyword('[홍길동 섭외] 강연 행사')).toBe('홍길동');
  });

  it('extracts keyword from "[이름 강연 섭외] ..." pattern', () => {
    expect(extractTitleKeyword('[안정환 강연 섭외] 기업 특강')).toBe('안정환 강연');
  });

  it('extracts keyword from "[키워드] ..." pattern without "섭외" suffix', () => {
    expect(extractTitleKeyword('[행사공연] 대학 축제 섭외')).toBe('행사공연');
  });

  it('returns null when no bracketed prefix exists', () => {
    expect(extractTitleKeyword('홍길동 섭외 일반 제목')).toBe(null);
  });

  it('handles NBSP inside brackets', () => {
    expect(extractTitleKeyword('[홍길동 섭외] 강연')).toBe('홍길동');
  });
});

describe('matchRssItem', () => {
  const baseRss: RssItem = {
    agency: 'mih_speaker',
    title: '[홍길동 섭외] 기업 강연',
    link: 'https://blog.naver.com/mih_speaker/1',
    pub_ts: 1779_400_000_000,
  };

  it('matches when titles are exactly equal after normalization', () => {
    const result = matchRssItem(baseRss, [mkArticle({})]);
    expect(result.matched?.id).toBe('a1');
    expect(result.reason).toBe('exact_title');
  });

  it('matches when DB title differs only in spacing/NBSP', () => {
    const rss = { ...baseRss, title: '[홍길동 섭외]  기업 강연' };
    const result = matchRssItem(rss, [mkArticle({ title: '[홍길동 섭외] 기업 강연' })]);
    expect(result.matched?.id).toBe('a1');
    expect(result.reason).toBe('exact_title');
  });

  it('matches by person_name when RSS title is "[person 섭외] ..." and exact title differs', () => {
    const rss = { ...baseRss, title: '[홍길동 섭외] 다른 부제' };
    const result = matchRssItem(rss, [mkArticle({})]);
    expect(result.matched?.id).toBe('a1');
    expect(result.reason).toBe('person_name_bracket');
  });

  it('matches by extracted keyword to person_name', () => {
    const rss = { ...baseRss, title: '[홍길동] 별도 부제' };
    const result = matchRssItem(rss, [mkArticle({ slug: 'something-else' })]);
    expect(result.matched?.id).toBe('a1');
    expect(result.reason).toBe('keyword_to_person');
  });

  it('matches by extracted keyword to slug when person_name differs', () => {
    const rss = { ...baseRss, title: '[hong] 부제' };
    const a = mkArticle({ person_name: '다른이름', slug: 'hong' });
    const result = matchRssItem(rss, [a]);
    expect(result.matched?.id).toBe('a1');
    expect(result.reason).toBe('keyword_to_slug');
  });

  it('returns null match when nothing fits', () => {
    const rss = { ...baseRss, title: '[엉뚱한키워드] xxx' };
    const result = matchRssItem(rss, [mkArticle({})]);
    expect(result.matched).toBe(null);
    expect(result.reason).toBe('none');
  });

  it('skips candidates whose agency does not match', () => {
    const rss = { ...baseRss, agency: 'mih_casting' as const };
    const result = matchRssItem(rss, [mkArticle({ agency: 'mih_speaker' })]);
    expect(result.matched).toBe(null);
  });

  it('skips already-published candidates and picks the unpublished one', () => {
    const published = mkArticle({ id: 'pub', published_at: '2026-05-21T00:00:00Z' });
    const unpub = mkArticle({ id: 'unpub', created_at: '2026-05-22T00:00:00Z' });
    const result = matchRssItem(baseRss, [published, unpub]);
    expect(result.matched?.id).toBe('unpub');
  });

  it('when multiple unpublished candidates match, picks the oldest created_at (FIFO)', () => {
    const older = mkArticle({ id: 'older', created_at: '2026-05-10T00:00:00Z' });
    const newer = mkArticle({ id: 'newer', created_at: '2026-05-20T00:00:00Z' });
    const result = matchRssItem(baseRss, [newer, older]);
    expect(result.matched?.id).toBe('older');
  });
});
