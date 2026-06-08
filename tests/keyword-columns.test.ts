import { describe, it, expect } from 'vitest';
import {
  KEYWORD_COLUMNS,
  DEFAULT_KEYWORD_COLUMNS,
  normalizeColumns,
} from '@/lib/keyword-columns';

describe('KEYWORD_COLUMNS', () => {
  it('does not include the article(원고) column', () => {
    expect(KEYWORD_COLUMNS.some((c) => c.key === 'article')).toBe(false);
  });
  it('keyword column is always-on', () => {
    const kw = KEYWORD_COLUMNS.find((c) => c.key === 'keyword');
    expect(kw?.always).toBe(true);
  });
});

describe('DEFAULT_KEYWORD_COLUMNS', () => {
  it('is keyword/search/category', () => {
    expect(DEFAULT_KEYWORD_COLUMNS).toEqual(['keyword', 'search', 'category']);
  });
});

describe('normalizeColumns', () => {
  it('forces keyword in and preserves meta order', () => {
    expect(normalizeColumns(['category', 'search'])).toEqual(['keyword', 'search', 'category']);
  });
  it('always includes keyword even if absent', () => {
    expect(normalizeColumns(['agency'])).toEqual(['keyword', 'agency']);
  });
  it('drops invalid and the article key', () => {
    expect(normalizeColumns(['article', 'bogus', 'notes'])).toEqual(['keyword', 'notes']);
  });
  it('empty input falls back to keyword only', () => {
    expect(normalizeColumns([])).toEqual(['keyword']);
  });
});
