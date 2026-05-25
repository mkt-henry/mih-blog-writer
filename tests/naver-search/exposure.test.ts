import { describe, it, expect } from 'vitest';
import { isMihExposed, MIH_BLOG_SLUGS } from '@/lib/naver-search/exposure';

describe('MIH_BLOG_SLUGS', () => {
  it('contains the three agency slugs', () => {
    expect(MIH_BLOG_SLUGS).toEqual(['mih_speaker', 'mih_casting', 'mih_agency']);
  });
});

describe('isMihExposed', () => {
  it('returns true when HTML contains blog.naver.com/mih_speaker', () => {
    const html = '<a href="https://blog.naver.com/mih_speaker/12345">post</a>';
    expect(isMihExposed(html)).toBe(true);
  });

  it('returns true when HTML contains blog.naver.com/mih_casting', () => {
    expect(isMihExposed('something blog.naver.com/mih_casting/9999 ...')).toBe(true);
  });

  it('returns true when HTML contains blog.naver.com/mih_agency', () => {
    expect(isMihExposed('blog.naver.com/mih_agency/1 ')).toBe(true);
  });

  it('returns false when HTML has only unrelated naver blog URLs', () => {
    const html = '<a href="https://blog.naver.com/other_blog/123">other</a>';
    expect(isMihExposed(html)).toBe(false);
  });

  it('returns false on empty HTML', () => {
    expect(isMihExposed('')).toBe(false);
  });

  it('returns false when slug appears without blog.naver.com prefix', () => {
    expect(isMihExposed('just text mih_speaker without context')).toBe(false);
  });
});
