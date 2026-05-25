import { describe, it, expect } from 'vitest';
import { parseRss, isKstDate, extractKeywordFromRssTitle } from '@/lib/naver-search/rss';

describe('parseRss', () => {
  it('extracts title, link, pubDate from a single CDATA item', () => {
    const xml = `<rss><channel>
      <item>
        <title><![CDATA[[안정환 강연 섭외] 기업 특강]]></title>
        <link>https://blog.naver.com/mih_speaker/12345</link>
        <pubDate>Sun, 24 May 2026 13:00:00 +0900</pubDate>
      </item>
    </channel></rss>`;
    const out = parseRss(xml);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('[안정환 강연 섭외] 기업 특강');
    expect(out[0].link).toBe('https://blog.naver.com/mih_speaker/12345');
    expect(out[0].ts).toBeGreaterThan(0);
  });

  it('extracts title from non-CDATA <title>', () => {
    const xml = `<rss><channel><item>
      <title>plain title</title>
      <link>https://x.test/1</link>
      <pubDate>Sun, 24 May 2026 00:00:00 +0900</pubDate>
    </item></channel></rss>`;
    const out = parseRss(xml);
    expect(out[0].title).toBe('plain title');
  });

  it('returns empty array on no items', () => {
    expect(parseRss('<rss><channel></channel></rss>')).toEqual([]);
  });

  it('skips items without a title', () => {
    const xml = `<rss><channel>
      <item><link>https://x.test/1</link><pubDate>Sun, 24 May 2026 00:00:00 +0900</pubDate></item>
      <item><title>has title</title><link>https://x.test/2</link><pubDate>Sun, 24 May 2026 01:00:00 +0900</pubDate></item>
    </channel></rss>`;
    const out = parseRss(xml);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('has title');
  });
});

describe('isKstDate', () => {
  it('returns true when ts converted to KST matches date string', () => {
    const tsAt0900KstMay24 = new Date('2026-05-24T00:00:00+09:00').getTime();
    expect(isKstDate(tsAt0900KstMay24, '2026-05-24')).toBe(true);
  });

  it('returns false when ts falls on the previous KST day', () => {
    const tsAt0800KstMay24 = new Date('2026-05-23T23:00:00+09:00').getTime();
    expect(isKstDate(tsAt0800KstMay24, '2026-05-24')).toBe(false);
  });

  it('returns false when ts is 0 (unparsed pubDate)', () => {
    expect(isKstDate(0, '2026-05-24')).toBe(false);
  });
});

describe('extractKeywordFromRssTitle', () => {
  it('extracts from "[XXX 섭외] ..." pattern', () => {
    expect(extractKeywordFromRssTitle('[안정환 강연 섭외] 기업 특강')).toBe('안정환 강연');
  });

  it('extracts from "[XXX] ..." without 섭외 suffix', () => {
    expect(extractKeywordFromRssTitle('[리더십 강의] 사내교육')).toBe('리더십 강의');
  });

  it('falls back to first 20 chars when no bracket', () => {
    expect(extractKeywordFromRssTitle('그냥 평범한 제목입니다 정말로 길다')).toBe('그냥 평범한 제목입니다 정말로 길다');
  });

  it('falls back to truncated 20-char prefix when title is longer than 20', () => {
    const long = '가나다라마바사아자차카타파하12345678901234567890';
    expect(extractKeywordFromRssTitle(long).length).toBeLessThanOrEqual(20);
  });
});
