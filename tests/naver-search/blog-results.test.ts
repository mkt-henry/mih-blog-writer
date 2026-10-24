import { describe, it, expect } from 'vitest';
import { parseBlogResults, mobileSearchUrl, fetchLoggedOutBlogResults } from '@/lib/naver-search/blog-results';

const item = (slug: string, id: string, name: string, title: string, snippet: string) => `
  <div><a href="https://m.blog.naver.com/${slug}" class="name"><span>${name}</span></a>
  <a href="https://m.blog.naver.com/${slug}/${id}"><img src="x.jpg"></a>
  <a href="https://m.blog.naver.com/${slug}/${id}" class="title"><mark>${title}</mark></a>
  <a href="https://m.blog.naver.com/${slug}/${id}" class="dsc">${snippet}</a></div>`;

describe('parseBlogResults', () => {
  const html =
    item('someone', '111', '남의 블로그', '아이유 섭외 &amp; 공연', '요약 하나') +
    item('mih_agency', '222', '메이드인헤븐', '아이유 섭외 안내', '요약 둘') +
    item('someone', '111', '남의 블로그', '중복', '중복');

  it('keeps one row per post in page order with blog name, title and snippet', () => {
    const r = parseBlogResults(html);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      rank: 1,
      url: 'https://blog.naver.com/someone/111',
      blogName: '남의 블로그',
      title: '아이유 섭외 & 공연',
      snippet: '요약 하나',
      ours: false,
    });
    expect(r[1]).toMatchObject({ rank: 2, slug: 'mih_agency', ours: true, title: '아이유 섭외 안내' });
  });

  it('returns nothing for a page without blog links', () => {
    expect(parseBlogResults('<html></html>')).toEqual([]);
  });
});

describe('mobileSearchUrl', () => {
  it('opens the mobile total search by default', () => {
    expect(mobileSearchUrl('아이유 섭외')).toBe(
      'https://m.search.naver.com/search.naver?where=m&ssc=tab.m.all&query=%EC%95%84%EC%9D%B4%EC%9C%A0%20%EC%84%AD%EC%99%B8',
    );
  });

  it('opens the mobile blog tab for blog', () => {
    expect(mobileSearchUrl('a&b', 'blog')).toBe('https://m.search.naver.com/search.naver?ssc=tab.m_blog.all&query=a%26b');
  });
});

describe('fetchLoggedOutBlogResults', () => {
  const anchors = item('mih_casting', '333', '메이드인헤븐', '변민석 섭외', '요약');

  it('falls back to the naver-serp function by region when Naver blocks the server IP', async () => {
    process.env.SUPABASE_URL = 'https://sb.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    const calls: string[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      const region = (init?.headers as Record<string, string>)['x-region'];
      calls.push(region ?? 'direct');
      if (!region) return new Response('blocked', { status: 403 });
      if (region === 'us-east-1') return Response.json({ naverStatus: 403 }, { status: 502 });
      return Response.json({ naverStatus: 200, anchors });
    }) as typeof fetch;

    const r = await fetchLoggedOutBlogResults('변민석 섭외', 'blog', 1_000, fetcher);
    expect(calls).toEqual(['direct', 'us-east-1', 'ap-south-1']);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ slug: 'mih_casting', ours: true, title: '변민석 섭외' });
  });

  it('throws when every route is blocked', async () => {
    process.env.SUPABASE_URL = 'https://sb.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    const fetcher = (async () => new Response('blocked', { status: 403 })) as typeof fetch;
    await expect(fetchLoggedOutBlogResults('x', 'total', 1_000, fetcher)).rejects.toThrow(/direct HTTP 403/);
  });
});
