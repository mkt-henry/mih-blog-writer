import { describe, it, expect } from 'vitest';
import { parseListPage, buildRow, crawlAll } from '@/scripts/crawl-hooh-keywords.mjs';

const SAMPLE = `
<ul class="list clearfix">
  <li>
    <a href="/sub/teacher/next.asp?m_idx=6" onclick="hash_form()">
      <div class="img"><img src="/upload/member/2323(8).png" alt="" /></div>
      <div class="txt">
        <div class="lname"> <!-- top 강사는 prm 클래스 추가 -->
          <p>김창옥</p>
          <span>김창옥휴먼컴퍼니 대표</span>
        </div>
        <p class="cate">동기부여, 열정, 소통</p> <!-- 텍스트 길이제한이 필요합니다 -->
      </div>
    </a>
  </li>
  <li>
    <a href="/sub/teacher/next.asp?m_idx=26" onclick="hash_form()">
      <div class="img"><img src="/x.jpg" alt="" /></div>
      <div class="txt">
        <div class="lname prm"> <!-- top 강사는 prm 클래스 추가 -->
          <p>김준혁</p>
          <span>국회의원, 전)교수</span>
        </div>
        <p class="cate">인문학, 역사</p>
      </div>
    </a>
  </li>
</ul>`;

describe('parseListPage', () => {
  it('extracts idx, name, title, cate per teacher', () => {
    expect(parseListPage(SAMPLE)).toEqual([
      { idx: '6', name: '김창옥', title: '김창옥휴먼컴퍼니 대표', cate: '동기부여, 열정, 소통' },
      { idx: '26', name: '김준혁', title: '국회의원, 전)교수', cate: '인문학, 역사' },
    ]);
  });

  it('returns empty array when no teacher items', () => {
    expect(parseListPage('<div class="top">전체 0 명</div>')).toEqual([]);
  });
});

describe('buildRow', () => {
  it('fixes category/agency and joins title|cate into notes', () => {
    expect(buildRow({ idx: '6', name: '김창옥', title: '김창옥휴먼컴퍼니 대표', cate: '동기부여, 열정' })).toEqual({
      id: 'hooh-6',
      keyword: '김창옥',
      category: '강연자',
      agency: 'mih_speaker',
      notes: '김창옥휴먼컴퍼니 대표 | 동기부여, 열정',
      source: 'https://www.hooh.kr/sub/teacher/next.asp?m_idx=6',
      is_active: true,
    });
  });

  it('drops empty parts from notes', () => {
    expect(buildRow({ idx: '7', name: '홍길동', title: '', cate: '리더십' }).notes).toBe('리더십');
    expect(buildRow({ idx: '8', name: '임꺽정', title: '작가', cate: '' }).notes).toBe('작가');
    expect(buildRow({ idx: '9', name: '아무개', title: '', cate: '' }).notes).toBe('');
  });
});

function pageHtml(ids: number[]): string {
  return ids.map((id) =>
    `<li><a href="/sub/teacher/next.asp?m_idx=${id}" onclick="hash_form()">` +
    `<div class="lname"><p>P${id}</p><span>t${id}</span></div>` +
    `<p class="cate">c${id}</p></a></li>`,
  ).join('');
}

describe('crawlAll', () => {
  it('paginates from page 1 until an empty page', async () => {
    const pages: Record<number, number[]> = { 1: [1, 2], 2: [3], 3: [] };
    const fetchPage = async (page: number) => pageHtml(pages[page] ?? []);
    const rows = await crawlAll(fetchPage);
    expect(rows.map((r) => r.idx)).toEqual(['1', '2', '3']);
  });

  it('stops when a page repeats already-seen ids (clamped)', async () => {
    const fetchPage = async () => pageHtml([1, 2]); // 항상 같은 페이지
    const rows = await crawlAll(fetchPage);
    expect(rows.map((r) => r.idx)).toEqual(['1', '2']);
  });

  it('respects maxPage safety cap', async () => {
    let calls = 0;
    const fetchPage = async (page: number) => { calls++; return pageHtml([page]); };
    const rows = await crawlAll(fetchPage, { maxPage: 3 });
    expect(calls).toBe(3);
    expect(rows.map((r) => r.idx)).toEqual(['1', '2', '3']);
  });
});
