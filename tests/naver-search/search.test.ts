import { describe, it, expect } from 'vitest';
import { buildNaverSearchUrl, SURFACES } from '@/lib/naver-search/search';

describe('SURFACES', () => {
  it('measures the blog tab and the total search, in that order', () => {
    expect(SURFACES).toEqual(['blog-tab', 'pc-total']);
  });
});

describe('buildNaverSearchUrl', () => {
  it('defaults to the total search', () => {
    expect(buildNaverSearchUrl('아이유 섭외')).toBe(
      'https://search.naver.com/search.naver?query=%EC%95%84%EC%9D%B4%EC%9C%A0%20%EC%84%AD%EC%99%B8',
    );
  });

  it('adds the blog tab selector for blog-tab', () => {
    const url = buildNaverSearchUrl('아이유 섭외', 'blog-tab');
    expect(url).toContain('ssc=tab.blog.all');
    expect(url).toContain('query=%EC%95%84%EC%9D%B4%EC%9C%A0%20%EC%84%AD%EC%99%B8');
  });

  it('encodes characters that would break the query string', () => {
    expect(buildNaverSearchUrl('a&b 섭외')).toContain('query=a%26b%20');
  });
});
