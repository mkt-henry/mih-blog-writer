import { describe, it, expect } from 'vitest';
import { normalizeTitle, extractTitleKeyword } from '@/lib/rss-matcher';

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
