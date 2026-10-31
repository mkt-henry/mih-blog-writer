import { describe, it, expect } from 'vitest';
import { parseScreenOrder, rankOfPost, fetchLoggedOutScreenOrder } from '@/lib/naver-search/blog-results';

const nlog = (gdid: string) => `data-nlog-params="{&quot;cr_rank_legacy&quot;:&quot;1&quot;,&quot;gdid&quot;:&quot;${gdid}&quot;}"`;
const blog = (gdid: string, slug: string, id: string, title: string) => `
  <div><a href="https://m.blog.naver.com/${slug}" ${nlog(gdid)}><span>${slug}</span></a>
  <a href="https://m.blog.naver.com/${slug}/${id}" ${nlog(gdid)}><img src="x.jpg"></a>
  <a href="https://m.blog.naver.com/${slug}/${id}" ${nlog(gdid)}>${title}</a></div>`;
const webDoc = (gdid: string) => `<a href="https://wesho.example/a" ${nlog(gdid)}>웹문서 제목</a><a href="https://wesho.example/a" ${nlog(gdid)}>요약</a>`;
const ad = `<a href="https://ad.example/x" data-nlog-params="{}">광고</a>`;

describe('parseScreenOrder', () => {
  // 2026-10-30 실측: 통합검색에서 웹문서(위쇼)가 우리 글 위에 있으면 우리 글은 2위다(앱 9.0 배지와 같은 수).
  const html = ad + webDoc('w1') + blog('b1', 'Mih_Agency', '222', '우리 글') + blog('b2', 'someone', '111', '남의 글') + blog('b3', 'kyh620303', '333', '우리 다른 글');

  it('counts every organic result on screen, web docs included and ads out', () => {
    const o = parseScreenOrder(html);
    expect(o.total).toBe(4);
    expect(o.posts).toEqual([
      { rank: 2, post: 'mih_agency/222' },
      { rank: 3, post: 'someone/111' },
      { rank: 4, post: 'kyh620303/333' },
    ]);
  });

  it('gives the rank of a post and of every MIH post on screen', () => {
    const o = parseScreenOrder(html);
    expect(rankOfPost(o, 'https://blog.naver.com/mih_agency/222')).toEqual({ rank: 2, ours: [2, 4], total: 4 });
    expect(rankOfPost(o, 'https://blog.naver.com/mih_agency/999')).toEqual({ rank: null, ours: [2, 4], total: 4 });
  });

  it('counts post links in page order on the blog tab, which has no gdid', () => {
    const tab = `<a href="https://m.blog.naver.com/a/1">글 1</a><a href="https://m.blog.naver.com/b/2">글 2</a><a href="https://m.blog.naver.com/a/1">요약</a>`;
    expect(parseScreenOrder(tab).posts).toEqual([
      { rank: 1, post: 'a/1' },
      { rank: 2, post: 'b/2' },
    ]);
  });
});

describe('fetchLoggedOutScreenOrder', () => {
  it('uses the screen order from the naver-serp function when Naver blocks the server', async () => {
    process.env.SUPABASE_URL = 'https://sb.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    const order = { total: 5, posts: [{ rank: 3, post: 'mih_casting/1' }] };
    const fetcher = (async (_url: string, init?: RequestInit) => {
      const region = (init?.headers as Record<string, string>)['x-region'];
      if (!region) return new Response('blocked', { status: 403 });
      return Response.json({ naverStatus: 200, anchors: '', order });
    }) as typeof fetch;
    expect(await fetchLoggedOutScreenOrder('변민석 섭외', 'total', 1_000, fetcher)).toEqual(order);
  });

  it('falls back to blog order when the function does not send a screen order yet', async () => {
    process.env.SUPABASE_URL = 'https://sb.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    const anchors = `<a href="https://m.blog.naver.com/x/9">남의 글</a><a href="https://m.blog.naver.com/MIH_casting/1">우리 글</a>`;
    const fetcher = (async (_url: string, init?: RequestInit) =>
      (init?.headers as Record<string, string>)['x-region']
        ? Response.json({ naverStatus: 200, anchors })
        : new Response('blocked', { status: 403 })) as typeof fetch;
    const o = await fetchLoggedOutScreenOrder('q', 'total', 1_000, fetcher);
    expect(rankOfPost(o, 'https://blog.naver.com/mih_casting/1').rank).toBe(2);
  });
});
