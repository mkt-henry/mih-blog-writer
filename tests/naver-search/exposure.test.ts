import { describe, it, expect } from 'vitest';
import { isMihExposed, MIH_BLOG_SLUGS, parseSerp } from '@/lib/naver-search/exposure';

describe('MIH_BLOG_SLUGS', () => {
  it('contains the agency blog slugs', () => {
    expect(MIH_BLOG_SLUGS).toEqual(['mih_speaker', 'mih_casting', 'mih_agency', 'kyh620303']);
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

  it('returns true when HTML contains blog.naver.com/kyh620303', () => {
    expect(isMihExposed('blog.naver.com/kyh620303/1 ')).toBe(true);
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

const html = (...urls: string[]) => urls.map((u) => `<a href="${u}">t</a>`).join('\n');

describe('parseSerp', () => {
  it('ranks blog post links in HTML order and finds our slug', () => {
    const r = parseSerp(
      html(
        'https://blog.naver.com/other_a/111',
        'https://blog.naver.com/mih_casting/222',
        'https://blog.naver.com/other_b/333',
      ),
    );
    expect(r.indexed).toBe(true);
    expect(r.rank).toBe(2);
    expect(r.entries).toHaveLength(3);
    expect(r.parseFailed).toBe(false);
  });

  it('records indexed=false with rank null when we are absent', () => {
    const r = parseSerp(html('https://blog.naver.com/other_a/111'));
    expect(r.indexed).toBe(false);
    expect(r.rank).toBeNull();
    expect(r.parseFailed).toBe(false);
  });

  it('dedupes the same post URL appearing twice', () => {
    const r = parseSerp(
      html(
        'https://blog.naver.com/other_a/111',
        'https://blog.naver.com/other_a/111',
        'https://blog.naver.com/mih_agency/222',
      ),
    );
    expect(r.entries.map((e) => e.url)).toEqual([
      'https://blog.naver.com/other_a/111',
      'https://blog.naver.com/mih_agency/222',
    ]);
    expect(r.rank).toBe(2);
  });

  it('ignores non-post blog links such as PostList', () => {
    const r = parseSerp(
      html('https://blog.naver.com/PostList.naver?blogId=x', 'https://blog.naver.com/other_a/111'),
    );
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].slug).toBe('other_a');
  });

  it('takes the best (lowest) rank when several of our blogs appear', () => {
    const r = parseSerp(
      html(
        'https://blog.naver.com/other_a/111',
        'https://blog.naver.com/mih_agency/222',
        'https://blog.naver.com/mih_casting/333',
      ),
    );
    expect(r.rank).toBe(2);
  });

  it('returns up to 5 competitors excluding our own blogs', () => {
    const r = parseSerp(
      html(
        'https://blog.naver.com/c1/1',
        'https://blog.naver.com/c2/2',
        'https://blog.naver.com/mih_speaker/3',
        'https://blog.naver.com/c3/4',
        'https://blog.naver.com/c4/5',
        'https://blog.naver.com/c5/6',
        'https://blog.naver.com/c6/7',
      ),
    );
    expect(r.competitors).toHaveLength(5);
    expect(r.competitors.map((c) => c.slug)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(r.competitors[0].rank).toBe(1);
  });

  it('flags parseFailed when no blog post links are found at all', () => {
    const r = parseSerp('<html><body>no results</body></html>');
    expect(r.parseFailed).toBe(true);
    expect(r.indexed).toBe(false);
    expect(r.rank).toBeNull();
  });

  it('flags parseFailed on empty HTML', () => {
    expect(parseSerp('').parseFailed).toBe(true);
  });

  it('handles m.blog.naver.com and protocol-relative URLs', () => {
    const r = parseSerp(html('//m.blog.naver.com/mih_speaker/999'));
    expect(r.indexed).toBe(true);
    expect(r.rank).toBe(1);
    expect(r.entries[0].url).toBe('https://blog.naver.com/mih_speaker/999');
  });
});
