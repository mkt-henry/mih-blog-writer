import { describe, it, expect } from 'vitest';
import {
  stripParen, norm, classify, makeSplitter, ALL_CAT_NOS, parseListPage,
  isDuplicate, buildRow, crawlCategory, shuffle, collectOutputNames,
} from '@/scripts/crawl-artsro-keywords.mjs';

const SAMPLE = `
  <!--li><a href="#idol_pop0"-->
  <li><a href="enter_view.html?GoIdx=4778&CatNo=87">
    <div class="idol_img"><img src="/x.png" /></div>
    <div class="idol_tbox">
      <p class="idol_title">이호선</p>
      <p class="idol_txt" style="height:60px;">따뜻한 상담 전문가</p>
    </div>
    </a>
  </li>
  <li><a href="enter_view.html?GoIdx=3550&CatNo=87">
    <div class="idol_img"><img src="/y.jpg" /></div>
    <div class="idol_tbox">
      <p class="idol_title">임용한 박사</p>
      <p class="idol_txt">통찰력 있는 분석가</p>
    </div>
    </a>
  </li>`;

describe('norm/stripParen', () => {
  it('strips paren annotations and normalizes', () => {
    expect(stripParen('정재승(카이스트(교수))')).toBe('정재승');
    expect(norm('  송길영  ')).toBe('송길영');
    expect(norm('송 길 영')).toBe('송길영');
  });
});

describe('classify', () => {
  it('maps speaker group to 강연자/mih_speaker (no split)', () => {
    expect(classify(87)).toEqual({ category: '강연자', agency: 'mih_speaker', split: false });
    expect(classify(96)).toEqual({ category: '강연자', agency: 'mih_speaker', split: false }); // 스포츠
  });
  it('maps 개그맨 / 방송인 with split', () => {
    expect(classify(85)).toEqual({ category: '개그맨', agency: null, split: true });
    expect(classify(89)).toEqual({ category: '방송인', agency: null, split: true });
    expect(classify(114)).toEqual({ category: '방송인', agency: null, split: true });
  });
  it('defaults all other CatNos to 가수 with split', () => {
    expect(classify(74)).toEqual({ category: '가수', agency: null, split: true }); // 아이돌
    expect(classify(40)).toEqual({ category: '가수', agency: null, split: true }); // 댄스
    expect(classify(58)).toEqual({ category: '가수', agency: null, split: true }); // 오케스트라
  });
});

describe('makeSplitter', () => {
  it('round-robins the three entertainer accounts', () => {
    const next = makeSplitter();
    expect([next(), next(), next(), next()]).toEqual(
      ['mih_casting', 'mih_agency', 'other', 'mih_casting'],
    );
  });
});

describe('ALL_CAT_NOS', () => {
  it('includes speaker, gagman, broadcast and performance CatNos', () => {
    for (const n of [87, 85, 89, 74, 40, 58]) expect(ALL_CAT_NOS).toContain(n);
  });
  it('has no duplicate CatNos', () => {
    expect(new Set(ALL_CAT_NOS).size).toBe(ALL_CAT_NOS.length);
  });
});

describe('parseListPage', () => {
  it('extracts goIdx, name, desc per person', () => {
    const rows = parseListPage(SAMPLE);
    expect(rows).toEqual([
      { goIdx: '4778', name: '이호선', desc: '따뜻한 상담 전문가' },
      { goIdx: '3550', name: '임용한 박사', desc: '통찰력 있는 분석가' },
    ]);
  });

  it('returns empty array when no person items', () => {
    expect(parseListPage('<div>no items</div>')).toEqual([]);
  });
});

describe('isDuplicate', () => {
  const excluded = new Set(['송길영', '임용한']);
  it('exact normalized match', () => {
    expect(isDuplicate('송길영', excluded)).toBe(true);
  });
  it('bidirectional startsWith catches title suffix', () => {
    expect(isDuplicate('임용한 박사', excluded)).toBe(true);   // kn="임용한박사" startsWith "임용한"
    expect(isDuplicate('송길영 작가', excluded)).toBe(true);
  });
  it('non-match returns false', () => {
    expect(isDuplicate('홍길동', excluded)).toBe(false);
  });
});

describe('buildRow', () => {
  it('builds keywords row with artsro id + notes source link', () => {
    const row = buildRow(
      { goIdx: '4778', name: '이호선', desc: '따뜻한 상담 전문가', catNo: 87 },
      'mih_speaker',
    );
    expect(row).toEqual({
      id: 'artsro-4778',
      keyword: '이호선',
      category: '강연자',
      agency: 'mih_speaker',
      notes: '따뜻한 상담 전문가 | https://www.artsro.com/right/enter_view.html?GoIdx=4778&CatNo=87',
      is_active: true,
    });
  });
});

function pageHtml(ids: number[]): string {
  return ids.map((id) =>
    `<li><a href="enter_view.html?GoIdx=${id}&CatNo=99">` +
    `<p class="idol_title">P${id}</p><p class="idol_txt">d${id}</p></a></li>`,
  ).join('');
}

describe('crawlCategory', () => {
  it('paginates until an empty page', async () => {
    const pages: Record<number, number[]> = { 0: [1, 2], 15: [3], 30: [] };
    const fetchPage = async (_cat: number, start: number) => pageHtml(pages[start] ?? []);
    const rows = await crawlCategory(99, fetchPage);
    expect(rows.map((r) => r.goIdx)).toEqual(['1', '2', '3']);
  });

  it('stops when a page repeats already-seen ids (clamped)', async () => {
    const fetchPage = async () => pageHtml([1, 2]); // 항상 같은 페이지
    const rows = await crawlCategory(99, fetchPage);
    expect(rows.map((r) => r.goIdx)).toEqual(['1', '2']);
  });
});

describe('shuffle', () => {
  it('returns a permutation with the same elements', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle([...input]);
    expect(out.length).toBe(input.length);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });
});

describe('collectOutputNames', () => {
  it('returns the accumulator unchanged for a missing directory', () => {
    const acc = new Set<string>(['기존']);
    expect(collectOutputNames('definitely-nonexistent-dir-xyz', acc)).toBe(acc);
    expect([...acc]).toEqual(['기존']);
  });
});
