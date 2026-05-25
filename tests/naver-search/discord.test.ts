import { describe, it, expect, vi, afterEach } from 'vitest';
import { postScreenshotToDiscord } from '@/lib/naver-search/discord';

const ORIGINAL_FETCH = globalThis.fetch;

describe('postScreenshotToDiscord', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it('posts multipart with payload_json containing keyword + URL and PNG file', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      captured = { url: url as string, init: init as RequestInit };
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await postScreenshotToDiscord({
      webhookUrl: 'https://discord.test/hook',
      keyword: '안정환 강연',
      searchUrl: 'https://search.naver.com/search.naver?query=%EC%95%88%EC%A0%95%ED%99%98',
      pngBuffer: png,
    });

    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('https://discord.test/hook');
    expect(captured!.init.method).toBe('POST');
    expect(captured!.init.body).toBeInstanceOf(FormData);

    const fd = captured!.init.body as FormData;
    const payloadJson = fd.get('payload_json') as string;
    const parsed = JSON.parse(payloadJson);
    expect(parsed.content).toContain('안정환 강연');
    expect(parsed.content).toContain('search.naver.com');

    const file = fd.get('files[0]');
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe('image/png');
  });

  it('throws on 4xx/5xx response', async () => {
    globalThis.fetch = vi.fn(async () => new Response('rate limited', { status: 429 })) as typeof fetch;

    await expect(
      postScreenshotToDiscord({
        webhookUrl: 'https://discord.test/hook',
        keyword: 'x',
        searchUrl: 'https://search.naver.com/x',
        pngBuffer: Buffer.from([0]),
      }),
    ).rejects.toThrow(/429/);
  });
});
