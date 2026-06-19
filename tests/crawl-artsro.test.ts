import { describe, it, expect } from 'vitest';
import {
  stripParen, norm, classify, makeSplitter, ALL_CAT_NOS,
} from '@/scripts/crawl-artsro-keywords.mjs';

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
