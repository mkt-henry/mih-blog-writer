import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Import once at module level — fetch is stubbed via vi.stubGlobal before each call
import { supabaseSelect } from '@/scripts/lib/supabase-rest.js';

function makeRow(i: number) {
  return { keyword: `kw${i}` };
}

function makeRows(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => makeRow(start + i));
}

function makeResponse(rows: object[], status: 200 | 206 = 206) {
  return {
    ok: true,
    status,
    headers: {
      get: (h: string) => (h.toLowerCase() === 'content-range' ? `0-999/9999` : null),
    },
    json: async () => rows,
  };
}

describe('supabaseSelect pagination', () => {
  it('no-limit: 2.5 pages (1000 + 1000 + 500) — returns all 2500, fetch called 3 times', async () => {
    const page1 = makeRows(0, 1000);
    const page2 = makeRows(1000, 1000);
    const page3 = makeRows(2000, 500);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse(page1, 206))
      .mockResolvedValueOnce(makeResponse(page2, 206))
      .mockResolvedValueOnce(makeResponse(page3, 206));

    vi.stubGlobal('fetch', mockFetch);

    const result = await supabaseSelect('keywords', { columns: 'keyword' });

    expect(result).toHaveLength(2500);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Check Range headers
    const calls = mockFetch.mock.calls;
    expect(calls[0][1].headers['Range']).toBe('0-999');
    expect(calls[1][1].headers['Range']).toBe('1000-1999');
    expect(calls[2][1].headers['Range']).toBe('2000-2999');
  });

  it('no-limit: exactly 1000 then empty — returns 1000, stops after empty page', async () => {
    const page1 = makeRows(0, 1000);
    const page2: object[] = [];

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse(page1, 206))
      .mockResolvedValueOnce(makeResponse(page2, 200));

    vi.stubGlobal('fetch', mockFetch);

    const result = await supabaseSelect('keywords', { columns: 'keyword' });

    expect(result).toHaveLength(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('limit=10: single request, returns ≤10 rows, no second page', async () => {
    const rows = makeRows(0, 10);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse(rows, 206));

    vi.stubGlobal('fetch', mockFetch);

    const result = await supabaseSelect('keywords', { columns: 'keyword', limit: 10 });

    expect(result).toHaveLength(10);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Should request exactly 10 rows via Range header
    const rangeHeader = mockFetch.mock.calls[0][1].headers['Range'];
    expect(rangeHeader).toBe('0-9');
  });

  it('limit=1500: crosses page boundary — 2 pages (1000, 500), Range headers bounded correctly', async () => {
    const page1 = makeRows(0, 1000);
    const page2 = makeRows(1000, 500);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeResponse(page1, 206))
      .mockResolvedValueOnce(makeResponse(page2, 206));

    vi.stubGlobal('fetch', mockFetch);

    const result = await supabaseSelect('keywords', { columns: 'keyword', limit: 1500 });

    expect(result).toHaveLength(1500);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Check Range headers: second page should be bounded to remaining limit (1000-1499, not 1000-1999)
    const calls = mockFetch.mock.calls;
    expect(calls[0][1].headers['Range']).toBe('0-999');
    expect(calls[1][1].headers['Range']).toBe('1000-1499');
  });

  it('select error (500): rejects with error message matching status and text', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'oops',
      });

    vi.stubGlobal('fetch', mockFetch);

    await expect(supabaseSelect('keywords', {}))
      .rejects
      .toThrow('keywords select 실패: 500 oops');
  });
});
