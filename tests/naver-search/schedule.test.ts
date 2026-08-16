import { describe, it, expect } from 'vitest';
import {
  CHECK_OFFSETS,
  kstDateMinus,
  kstDateOf,
  targetDates,
  articleQuery,
  groupByQuery,
  toSearchQuery,
  type PublishedArticle,
} from '@/lib/naver-search/schedule';

// 2026-08-15 09:00 KST == 2026-08-15T00:00:00Z
const NOW = new Date('2026-08-15T00:00:00Z');

const art = (over: Partial<PublishedArticle> = {}): PublishedArticle => ({
  id: 'a1',
  person_name: '아이유',
  title: '[아이유 섭외] 어쩌고',
  publish_date: '2026-08-14',
  ...over,
});

describe('CHECK_OFFSETS', () => {
  it('is D+1, 3, 7, 14, 30', () => {
    expect(CHECK_OFFSETS).toEqual([1, 3, 7, 14, 30]);
  });
});

describe('toSearchQuery', () => {
  it('appends 섭외', () => {
    expect(toSearchQuery('아이유')).toBe('아이유 섭외');
  });

  it('does not append when already suffixed', () => {
    expect(toSearchQuery('아이유 섭외')).toBe('아이유 섭외');
  });

  it('trims surrounding whitespace', () => {
    expect(toSearchQuery('  박효신 ')).toBe('박효신 섭외');
  });
});

describe('kstDateMinus', () => {
  it('subtracts days in KST', () => {
    expect(kstDateMinus(1, NOW)).toBe('2026-08-14');
    expect(kstDateMinus(30, NOW)).toBe('2026-07-16');
  });
});

describe('kstDateOf', () => {
  it('maps a timestamp to its KST calendar date', () => {
    // 예약 발행이 다음날 아침으로 밀린 케이스 — 예정일이 아니라 이 날짜로 D+N 을 재야 한다.
    expect(kstDateOf('2026-08-16T00:00:00Z')).toBe('2026-08-16'); // KST 09:00
    expect(kstDateOf('2026-08-15T15:30:00Z')).toBe('2026-08-16'); // KST 00:30, 날짜 넘어감
    expect(kstDateOf('2026-08-15T14:59:00Z')).toBe('2026-08-15'); // KST 23:59
  });
});

describe('targetDates', () => {
  it('returns one date per offset', () => {
    expect(targetDates(NOW)).toEqual([
      '2026-08-14',
      '2026-08-12',
      '2026-08-08',
      '2026-08-01',
      '2026-07-16',
    ]);
  });
});

describe('articleQuery', () => {
  it('builds "<person> 섭외" from person_name', () => {
    expect(articleQuery(art())).toBe('아이유 섭외');
  });

  it('does not double the 섭외 suffix', () => {
    expect(articleQuery(art({ person_name: '아이유 섭외' }))).toBe('아이유 섭외');
  });

  it('falls back to the bracket keyword in the title when person_name is empty', () => {
    expect(articleQuery(art({ person_name: null, title: '[박효신 섭외] 무대' }))).toBe('박효신 섭외');
  });

  it('returns null when neither person_name nor a bracket keyword exists', () => {
    expect(articleQuery(art({ person_name: null, title: '제목만 있음' }))).toBeNull();
  });
});

describe('groupByQuery', () => {
  it('groups articles sharing one query so we search once', () => {
    const groups = groupByQuery([
      art({ id: 'a1', person_name: '아이유' }),
      art({ id: 'a2', person_name: '아이유' }),
      art({ id: 'a3', person_name: '박효신' }),
    ]);
    expect(groups).toEqual([
      { query: '아이유 섭외', articleIds: ['a1', 'a2'] },
      { query: '박효신 섭외', articleIds: ['a3'] },
    ]);
  });

  it('drops articles with no derivable query', () => {
    const groups = groupByQuery([art({ id: 'a1', person_name: null, title: '제목만' })]);
    expect(groups).toEqual([]);
  });
});
