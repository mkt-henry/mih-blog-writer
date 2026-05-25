import { describe, it, expect } from 'vitest';
import { extractUniqueKeywords, type ArticleForKeyword } from '@/lib/naver-search/keywords';

function mk(over: Partial<ArticleForKeyword>): ArticleForKeyword {
  return {
    title: '[홍길동 섭외] 강연 행사',
    person_name: '홍길동',
    ...over,
  };
}

describe('extractUniqueKeywords', () => {
  it('extracts keywords from [XXX 섭외] title pattern', () => {
    const out = extractUniqueKeywords([mk({ title: '[안정환 강연 섭외] 기업 특강', person_name: '안정환' })]);
    expect(out).toEqual(['안정환 강연']);
  });

  it('extracts keywords from [XXX] without 섭외 suffix', () => {
    const out = extractUniqueKeywords([mk({ title: '[리더십 강의] 사내교육', person_name: '' })]);
    expect(out).toEqual(['리더십 강의']);
  });

  it('falls back to person_name when title bracket missing', () => {
    const out = extractUniqueKeywords([mk({ title: '강연 행사 안내', person_name: '홍길동' })]);
    expect(out).toEqual(['홍길동']);
  });

  it('dedupes the same keyword across multiple agencies', () => {
    const out = extractUniqueKeywords([
      mk({ title: '[홍길동 섭외] A', person_name: '홍길동' }),
      mk({ title: '[홍길동 섭외] B', person_name: '홍길동' }),
    ]);
    expect(out).toEqual(['홍길동']);
  });

  it('preserves insertion order for distinct keywords', () => {
    const out = extractUniqueKeywords([
      mk({ title: '[A 섭외] x', person_name: 'A' }),
      mk({ title: '[B 섭외] y', person_name: 'B' }),
      mk({ title: '[C 섭외] z', person_name: 'C' }),
    ]);
    expect(out).toEqual(['A', 'B', 'C']);
  });

  it('skips an article entirely when neither title nor person_name yield a keyword', () => {
    const out = extractUniqueKeywords([
      mk({ title: '제목 없음', person_name: '' }),
      mk({ title: '[홍길동 섭외] x', person_name: '홍길동' }),
    ]);
    expect(out).toEqual(['홍길동']);
  });

  it('trims whitespace in fallback person_name', () => {
    const out = extractUniqueKeywords([mk({ title: '본문만', person_name: '  홍길동  ' })]);
    expect(out).toEqual(['홍길동']);
  });
});
