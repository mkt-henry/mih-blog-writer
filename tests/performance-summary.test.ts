import { describe, it, expect } from 'vitest';
import { performanceCounts, performanceText } from '@/lib/performance-summary';

describe('performanceText', () => {
  const lines = [
    { keyword: '전우영 섭외', rank: 1 },
    { keyword: '신명진 섭외', rank: 4 },
    { keyword: '엠비크루 섭외', rank: null },
    { keyword: '원장현 섭외', rank: 'error' as const },
  ];

  it('counts exposed, first place and top three', () => {
    expect(performanceCounts(lines)).toEqual({ total: 4, exposed: 2, top1: 1, top3: 1, pending: 0 });
  });

  it('writes one block to paste: headline, counts, then each keyword with its rank', () => {
    expect(performanceText('2026-10-30', lines, '10/31 13:50')).toBe(
      [
        '▶ 10/30 발행 4건 검색 성과 (네이버 통합검색 · 10/31 13:50 기준)',
        '노출 2/4건 · 1위 1건 · 3위 안 1건',
        '',
        '전우영 섭외 1위',
        '신명진 섭외 4위',
        '엠비크루 섭외 미노출',
        '원장현 섭외 확인 못 함',
      ].join('\n'),
    );
  });
});
