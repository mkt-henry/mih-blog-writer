import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { postScreenshotNotice, postSerpSummary } from '@/lib/naver-search/notify';

const ORIGINAL_FETCH = globalThis.fetch;

describe('AIStudio 검색 노출 알림', () => {
  beforeEach(() => {
    process.env.AISTUDIO_NOTIFY_TOKEN = 'test-token';
    process.env.AISTUDIO_NOTIFY_URL = 'https://aistudio.test/api/hooks/notify';
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete process.env.AISTUDIO_NOTIFY_TOKEN;
    delete process.env.AISTUDIO_NOTIFY_URL;
  });

  it('스크린샷 한 건을 푸시 없이 사진·링크·중복 키와 함께 보낸다', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      captured = { url: url as string, init: init as RequestInit };
      return new Response('{"notification_id":"n1"}', { status: 200 });
    }) as typeof fetch;

    await postScreenshotNotice({
      keyword: '안정환 강연',
      searchUrl: 'https://search.naver.com/search.naver?query=%EC%95%88%EC%A0%95%ED%99%98',
      pngBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      date: '2026-10-04',
    });

    expect(captured!.url).toBe('https://aistudio.test/api/hooks/notify');
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    const body = JSON.parse(captured!.init.body as string);
    expect(body.title).toContain('안정환 강연');
    expect(body.url).toContain('search.naver.com');
    expect(body.push).toBe(false);
    expect(body.dedupe_key).toBe('serp-shot-2026-10-04-안정환 강연');
    expect(body.images).toHaveLength(1);
    expect(body.images[0].name).toBe('안정환_강연.png');
    expect(Buffer.from(body.images[0].data, 'base64')).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('요약은 노출이 없고 오류도 없으면 푸시하지 않는다', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      bodies.push(JSON.parse((init as RequestInit).body as string));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await postSerpSummary({ date: '2026-10-04', groups: 3, exposedTotal: 0, indexedBlogTab: 1, missed: 2, posted: 0, errors: [] });
    await postSerpSummary({ date: '2026-10-04', groups: 3, exposedTotal: 2, indexedBlogTab: 3, missed: 0, posted: 2, errors: ['x: boom'] });

    expect(bodies[0].push).toBe(false);
    expect(bodies[0].level).toBe('success');
    expect(bodies[1].push).toBe(true);
    expect(bodies[1].level).toBe('warning');
    expect(bodies[1].body).toContain('x: boom');
  });

  it('2xx 가 아니면 실패로 던진다', async () => {
    globalThis.fetch = vi.fn(async () => new Response('rate limited', { status: 429 })) as typeof fetch;
    await expect(
      postScreenshotNotice({ keyword: 'x', searchUrl: 'https://search.naver.com/x', pngBuffer: Buffer.from([0]), date: '2026-10-04' }),
    ).rejects.toThrow(/429/);
  });

  it('토큰이 없으면 보내지 않고 던진다', async () => {
    delete process.env.AISTUDIO_NOTIFY_TOKEN;
    globalThis.fetch = vi.fn() as typeof fetch;
    await expect(
      postScreenshotNotice({ keyword: 'x', searchUrl: 'https://search.naver.com/x', pngBuffer: Buffer.from([0]), date: '2026-10-04' }),
    ).rejects.toThrow(/AISTUDIO_NOTIFY_TOKEN/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
