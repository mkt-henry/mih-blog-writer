import { describe, expect, it } from 'vitest';
// @ts-expect-error — 스크립트(.mjs)라 타입 선언이 없다
import { slotRows } from '../../scripts/record-publish-slots.mjs';

// 2026-10-24: 매일 알림을 그날 마지막 예약 발행 + 10분에 보낸다. run.sh 가 넘기는 "HH:MM" 을 KST 시각으로 적는다.
describe('slotRows', () => {
  it('예약 시각을 그날 KST 시각으로 바꾼다', () => {
    expect(slotRows('2026-10-25', 'mih_agency', ['07:30', '08:40', '11:40'])).toEqual([
      { publish_date: '2026-10-25', agency: 'mih_agency', slot_at: '2026-10-25T07:30:00+09:00' },
      { publish_date: '2026-10-25', agency: 'mih_agency', slot_at: '2026-10-25T08:40:00+09:00' },
      { publish_date: '2026-10-25', agency: 'mih_agency', slot_at: '2026-10-25T11:40:00+09:00' },
    ]);
  });

  it('예약에 모두 실패하면 빈 목록(그 계정 기록을 지운다)', () => {
    expect(slotRows('2026-10-25', 'mih_other', [])).toEqual([]);
  });

  it('형식이 틀린 날짜·시각은 거절한다', () => {
    expect(() => slotRows('10-25', 'mih_agency', ['07:30'])).toThrow();
    expect(() => slotRows('2026-10-25', 'mih_agency', ['0730'])).toThrow();
  });
});
