import { describe, expect, it } from 'vitest';
import { alertText, embedColor, segments, stripMarkdown } from '@/lib/alert-format';
import { toPush } from '../../supabase/functions/send-push/message';

const newArticle = {
  embeds: [
    {
      title: '📝 새 원고 등록: **가수 섭외** 아무개',
      url: 'https://mih.bp-studio.com/articles/1',
      color: 0x1565c0,
      fields: [
        { name: '계정', value: 'casting', inline: true },
        { name: '발행일', value: '2026-10-18', inline: true },
        { name: '키워드', value: '`아무개 섭외`' },
      ],
      footer: { text: 'MIH' },
    },
  ],
};

const status = {
  content: '▶ 2026-10-17\n\n**아무개 섭외**\nhttps://blog.naver.com/x/1\n\n**홍길동 섭외**\nhttps://blog.naver.com/x/2',
};

describe('alert-format', () => {
  it('복사 글자에서 마크다운 기호를 걷어 낸다', () => {
    expect(stripMarkdown('**굵게** `코드` __밑줄__')).toBe('굵게 코드 밑줄');
  });

  it('임베드 알림을 Discord 화면 순서대로 복사한다', () => {
    expect(alertText(newArticle)).toBe(
      '📝 새 원고 등록: 가수 섭외 아무개\n\n계정\ncasting\n\n발행일\n2026-10-18\n\n키워드\n아무개 섭외',
    );
  });

  it('본문 알림은 본문 그대로 복사한다', () => {
    expect(alertText(status)).toBe(
      '▶ 2026-10-17\n\n아무개 섭외\nhttps://blog.naver.com/x/1\n\n홍길동 섭외\nhttps://blog.naver.com/x/2',
    );
  });

  it('한 줄을 굵게·코드·주소 조각으로 나눈다', () => {
    expect(segments('**가** 나 `다` https://a.b/c 끝')).toEqual([
      { kind: 'bold', text: '가' },
      { kind: 'text', text: ' 나 ' },
      { kind: 'code', text: '다' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'https://a.b/c' },
      { kind: 'text', text: ' 끝' },
    ]);
  });

  it('임베드 색을 #rrggbb 로 바꾼다', () => {
    expect(embedColor(0x1565c0)).toBe('#1565c0');
    expect(embedColor(0xff)).toBe('#0000ff');
    expect(embedColor(undefined)).toBe('#4E5058');
  });
});

describe('send-push 문구', () => {
  it('임베드 제목을 제목으로, 짧은 항목은 "이름: 값" 으로 쓴다', () => {
    const p = toPush(7, 'new-article', newArticle);
    expect(p.title).toBe('📝 새 원고 등록: 가수 섭외 아무개');
    expect(p.body).toBe('계정: casting\n발행일: 2026-10-18\n키워드: 아무개 섭외');
    expect(p.url).toBe('/alerts#a7');
    expect(p.tag).toBe('mih-alert-7');
    expect(p.image).toBeUndefined();
  });

  it('본문만 있으면 첫 줄이 제목이고 나머지가 본문이다', () => {
    const p = toPush(8, 'status', status);
    expect(p.title).toBe('▶ 2026-10-17');
    expect(p.body.split('\n')[0]).toBe('아무개 섭외');
  });

  it('본문이 길면 400자에서 자른다', () => {
    const p = toPush(9, 'search', { content: '제목\n' + 'ㄱ'.repeat(1000) });
    expect(p.body.length).toBe(400);
    expect(p.body.endsWith('…')).toBe(true);
  });

  it('사진이 있으면 첫 사진을 붙이고, 아무 글자도 없으면 채널 이름을 쓴다', () => {
    const p = toPush(10, 'serp-shot', {}, [{ url: 'https://img.bp-studio.com/alerts/a.jpg' }]);
    expect(p.title).toBe('MIH 검색 캡처');
    expect(p.image).toBe('https://img.bp-studio.com/alerts/a.jpg');
  });
});
