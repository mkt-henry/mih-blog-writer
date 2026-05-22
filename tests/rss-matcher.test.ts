import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '@/lib/rss-matcher';

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
