import { describe, expect, it } from 'vitest';
import { alertText } from '@/lib/alert-format';
import {
  buildSearchReport,
  buildStatusReport,
  pickReportDay,
  rssCoversDay,
  extractKeyword,
  kstDateStr,
  parseRss,
  searchUrl,
} from '@/lib/daily-report';

const rssXml = (items: { title: string; link: string; pub: string }[]) =>
  `<rss><channel>${items
    .map(
      (i) =>
        `<item><title><![CDATA[${i.title}]]></title><link><![CDATA[${i.link}]]></link><pubDate>${i.pub}</pubDate></item>`,
    )
    .join('')}</channel></rss>`;

// 2026-10-22 KST 07:10 = 2026-10-21 22:10 UTC
const casting = parseRss(
  rssXml([
    { title: '[홍길동 가수 섭외] 행사 무대 안내', link: 'https://blog.naver.com/mih_casting/1', pub: 'Wed, 21 Oct 2026 22:10:00 GMT' },
    { title: '[어제 가수 섭외] 어제 글', link: 'https://blog.naver.com/mih_casting/0', pub: 'Tue, 20 Oct 2026 23:00:00 GMT' },
  ]),
);
const agency = parseRss(
  rssXml([{ title: '[아무개 섭외] 강연 안내', link: 'https://blog.naver.com/mih_agency/9', pub: 'Wed, 21 Oct 2026 21:05:00 GMT' }]),
);

describe('daily-report', () => {
  it('KST 날짜와 키워드를 daily-notify 와 같게 뽑는다', () => {
    expect(kstDateStr(Date.parse('2026-10-21T15:30:00Z'))).toBe('2026-10-22');
    expect(extractKeyword('[홍길동 가수 섭외] 행사')).toBe('홍길동 가수');
    expect(extractKeyword('[아무개 섭외] 강연')).toBe('아무개');
    expect(searchUrl('아무개')).toBe(
      'https://search.naver.com/search.naver?where=blog&query=%EC%95%84%EB%AC%B4%EA%B0%9C%20%EC%84%AD%EC%99%B8',
    );
  });

  it('발행 현황은 Discord 와 같은 임베드 + 키워드/URL 메시지', () => {
    const r = buildStatusReport({ mih_casting: casting, mih_agency: agency }, [], '2026-10-22', '2026-10-22T03:00:00.000Z');
    expect(r.total).toBe(2);
    expect(r.messages).toHaveLength(2);
    const f = r.messages[0].embeds![0].fields![0];
    expect(f.name).toBe('📡 오늘 발행 (2건)');
    expect(f.value).toBe('**[캐스팅]**\n  `07:10` [홍길동 가수 섭외] 행사 무대 안내\n\n**[에이전시]**\n  `06:05` [아무개 섭외] 강연 안내');
    expect(r.messages[1].content).toBe(
      '▶ 2026-10-22\n\n아무개 섭외\nhttps://blog.naver.com/mih_agency/9\n\n홍길동 가수 섭외\nhttps://blog.naver.com/mih_casting/1',
    );
    expect(alertText(r.messages[0])).toContain('[캐스팅]\n  07:10 [홍길동 가수 섭외]');
  });

  it('발행이 없으면 임베드 하나, RSS 오류는 필드로', () => {
    const r = buildStatusReport({}, ['캐스팅: HTTP 500'], '2026-10-23', '2026-10-23T03:00:00.000Z');
    expect(r.messages).toHaveLength(1);
    const fields = r.messages[0].embeds![0].fields!;
    expect(fields[0].value).toBe('아직 발행된 원고가 없습니다.');
    expect(fields[1]).toMatchObject({ name: '⚠️ RSS 수집 오류', value: '캐스팅: HTTP 500' });
  });

  it('검색 노출은 그날 발행 키워드 검색 주소, 없으면 메시지 없음', () => {
    const r = buildSearchReport({ mih_casting: casting, mih_agency: agency }, '2026-10-22');
    expect(r.rows.map((x) => [x.agency, x.keyword, x.time])).toEqual([
      ['mih_agency', '아무개 섭외', '06:05'],
      ['mih_casting', '홍길동 가수 섭외', '07:10'],
    ]);
    expect(r.message?.content).toBe(`▶ 2026-10-22 검색 노출\n\n${searchUrl('아무개')}\n\n${searchUrl('홍길동 가수')}`);
    expect(buildSearchReport({ mih_casting: casting }, '2026-10-19').message).toBeNull();
  });
});

describe('pickReportDay / rssCoversDay (날짜 바꾸기, 2026-10-27)', () => {
  it('형식이 틀리거나 미래면 오늘', () => {
    expect(pickReportDay(undefined, '2026-10-27')).toBe('2026-10-27');
    expect(pickReportDay('2026-10-2', '2026-10-27')).toBe('2026-10-27');
    expect(pickReportDay('2026-10-30', '2026-10-27')).toBe('2026-10-27');
    expect(pickReportDay('2026-10-26', '2026-10-27')).toBe('2026-10-26');
  });
  it('가장 오래된 RSS 글이 그날보다 뒤면 일부가 빠졌을 수 있다', () => {
    const it2 = (iso: string) => ({ title: 't', link: 'l', pubDate: iso, ts: Date.parse(iso) });
    const rss = { mih_agency: [it2('2026-10-20T00:00:00Z')], other: [] };
    expect(rssCoversDay(rss, '2026-10-26')).toBe(true);
    expect(rssCoversDay(rss, '2026-10-10')).toBe(false);
  });
});
