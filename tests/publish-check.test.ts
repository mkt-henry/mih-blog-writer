import { describe, expect, it } from 'vitest';
import { checkPublish, todoCard, type DbArticle } from '@/lib/publish-check';
import type { RssByAgency } from '@/lib/daily-report';

// 2026-10-26 12:00 KST
const NOW = Date.parse('2026-10-26T03:00:00Z');
const at = (iso: string) => ({ title: '[x 섭외] t', link: 'l', pubDate: iso, ts: Date.parse(iso) });
const three = (day: string) => [at(`${day}T23:00:00Z`), at(`${day}T23:30:00Z`), at(`${day}T23:50:00Z`)];

describe('checkPublish', () => {
  it('2026-10-26: 기타 예약이 없어 6/9 — 기타만 미달, 원인은 예약 없음', () => {
    const rss: RssByAgency = {
      mih_agency: three('2026-10-25'),
      mih_speaker: three('2026-10-25'),
      other: [at('2026-10-25T00:00:00Z')], // 어제(10-25) 글
      mih_casting: [],
    };
    const rows: DbArticle[] = [
      ...['2026-10-25T23:00:00Z', '2026-10-25T23:30:00Z', '2026-10-26T00:10:00Z'].map((p) => ({
        agency: 'mih_agency', published_at: p, reserved_at: p, published_url: 'u',
      })),
      { agency: 'other', published_at: null, reserved_at: null, published_url: null },
      { agency: 'other', published_at: null, reserved_at: null, published_url: null },
    ];
    const c = checkPublish(rss, rows, NOW);
    expect(c.day).toBe('2026-10-26');
    expect(c.target).toBe(9);
    expect(c.published).toBe(6);
    expect(c.shortAccounts.map((a) => a.agency)).toEqual(['other']);
    expect(c.shortAccounts[0].reason).toContain('예약이 하나도 안 걸려');
    expect(c.shortAccounts[0].reason).toContain('대기 원고 2편');
    expect(todoCard(c).title).toBe('MIH 10-26 발행 6/9건 — 기타 0건');
  });

  it('9건 다 나오면 미달 없음, 섭외는 최근 글이 없으면 세지 않는다', () => {
    const rss: RssByAgency = {
      mih_agency: three('2026-10-25'),
      mih_speaker: three('2026-10-25'),
      other: three('2026-10-25'),
    };
    const c = checkPublish(rss, [], NOW);
    expect(c.target).toBe(9);
    expect(c.shortAccounts).toEqual([]);
  });

  it('섭외가 최근에 글을 냈으면 12건 기준으로 센다', () => {
    const rss: RssByAgency = {
      mih_agency: three('2026-10-25'),
      mih_speaker: three('2026-10-25'),
      other: three('2026-10-25'),
      mih_casting: [at('2026-10-24T23:00:00Z')],
    };
    const c = checkPublish(rss, [], NOW);
    expect(c.target).toBe(12);
    expect(c.shortAccounts.map((a) => a.label)).toEqual(['섭외']);
  });

  it('예약은 걸렸는데 덜 올라오면 예약 풀림 쪽으로 알린다', () => {
    const rss: RssByAgency = { mih_agency: [at('2026-10-25T23:00:00Z')], mih_speaker: three('2026-10-25'), other: three('2026-10-25') };
    const rows: DbArticle[] = ['2026-10-25T23:00:00Z', '2026-10-25T23:30:00Z', '2026-10-26T00:10:00Z'].map((p) => ({
      agency: 'mih_agency', published_at: p, reserved_at: p, published_url: null,
    }));
    const c = checkPublish(rss, rows, NOW);
    expect(c.shortAccounts[0].reason).toContain('예약은 3편 걸려 있었는데 1편만');
  });
});
