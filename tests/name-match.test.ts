import { describe, it, expect } from 'vitest';
import {
  stripParen,
  norm,
  titleName,
  isExcluded,
  aliasesOf,
  excludeReason,
  namesOf,
  buildNameIndex,
  fetchAll,
} from '@/lib/name-match.mjs';

describe('norm / stripParen', () => {
  it('괄호 주석을 떼고 공백·대소문자를 정규화한다', () => {
    expect(stripParen('정재승(카이스트(교수))')).toBe('정재승');
    expect(stripParen('홍석천（강연）')).toBe('홍석천');
    expect(norm('송 길 영')).toBe('송길영');
    expect(norm('  Danny Cho ')).toBe('dannycho');
    expect(norm(null)).toBe('');
  });
});

describe('titleName — 원고 제목에서 인물명 추출', () => {
  it('"[이름 섭외] ..." 패턴에서 인물명만 뽑는다', () => {
    expect(titleName('[범접 섭외] 스우파3 메가크루 신드롬')).toBe('범접');
    expect(titleName('[김미경 강연] 자기계발 멘토')).toBe('김미경');
    expect(titleName('[핏블리 초빙] 피트니스 크리에이터')).toBe('핏블리');
    expect(titleName('[V.O.S 섭외] 매일매일')).toBe('v.o.s');
  });

  it('역할어가 겹쳐 붙은 제목도 인물명까지 줄인다', () => {
    // "[송길영 강연 섭외]" 를 "송길영강연" 으로 남기면 발행본("송길영")과 매칭되지 않아
    // 이미 발행한 인물의 초안이 계정 피드에 다시 노출된다.
    expect(titleName('[송길영 강연 섭외] AI·경량문명 트렌드')).toBe('송길영');
    expect(titleName('[김미경 강연 섭외] 자기계발 강사')).toBe('김미경');
    expect(titleName('[소금툰 강연 섭외] 인스타툰 작가')).toBe('소금툰');
  });

  it('카테고리 원고 제목("[가수섭외] ...")은 접미어를 떼지 않는다', () => {
    // "가수"만 남기면 "가수"로 시작하는 모든 키워드가 통째로 제외돼 버린다.
    expect(titleName('[가수섭외] 발라드·K-POP 가수 행사 섭외 가이드')).toBe('가수섭외');
    expect(titleName('[기업강연섭외] 기업 행사·워크숍')).toBe('기업강연섭외');
  });

  it('대괄호가 없으면 빈 문자열, 1글자 인물명("벤","숀")은 살린다', () => {
    expect(titleName('범접 섭외 가이드')).toBe('');
    expect(titleName('[벤 섭외] 열애중')).toBe('벤');
    expect(titleName('[숀] 웨이 백 홈')).toBe('숀');
    expect(titleName(null)).toBe('');
  });
});

describe('isExcluded', () => {
  it('직함이 붙은 키워드를 양방향 접두 비교로 잡는다', () => {
    const set = new Set(['송길영']);
    expect(isExcluded('송길영 작가', set)).toBe(true);
    expect(isExcluded('송길영(빅데이터)', set)).toBe(true);
  });

  it('제외 집합에 빈 문자열이 섞여도 전건이 제외되지 않는다', () => {
    // person_name 이 null/공백인 행 하나 때문에 후보 풀 전체가 날아가는 사고 방지
    const set = new Set(['', '송길영']);
    expect(isExcluded('아이유', set)).toBe(false);
    expect(isExcluded('송길영', set)).toBe(true);
  });

  it('1글자 이름은 접두 비교 대상에서 빼서 오탈락을 막는다', () => {
    expect(isExcluded('벤티', new Set(['벤']))).toBe(false);
    expect(isExcluded('벤', new Set(['벤']))).toBe(true); // 정확히 같으면 제외
  });
});

describe('aliasesOf — 키워드 표기 변형', () => {
  it('괄호 안 표기를 별칭으로 뽑는다', () => {
    expect(aliasesOf('HAON(김하온)')).toContain('김하온');
    expect(aliasesOf('DK (디케이)')).toContain('디케이');
    expect(aliasesOf('생각대로 사는 여자(박제인)')).toContain('박제인');
  });

  it('수식어 + 이름 형태에서 이름 토큰을 뽑는다', () => {
    expect(aliasesOf('샌드아트 임혁필')).toContain('임혁필');
    expect(aliasesOf('팬타곤 키노')).toContain('키노');
    expect(aliasesOf('라포엠 유채훈')).toContain('유채훈');
    expect(aliasesOf('햄찌/햄지')).toContain('햄지');
  });

  it('직함·장르 같은 일반 수식어는 별칭에서 뺀다', () => {
    // "밴드"·"마술사"가 별칭이 되면 그 이름의 원고 하나로 후보가 대량 오탈락된다.
    expect(aliasesOf('밴드 하이브로')).not.toContain('밴드');
    expect(aliasesOf('마술사 아리엘')).not.toContain('마술사');
    expect(aliasesOf('DJ 이하늘')).not.toContain('dj');
    expect(aliasesOf('마술사 아리엘')).toContain('아리엘');
  });

  it('1글자 토큰은 별칭에서 뺀다', () => {
    expect(aliasesOf('에드워드 리')).not.toContain('리');
    expect(aliasesOf('에드워드 리')).toContain('에드워드리');
  });
});

describe('excludeReason — 제외 사유', () => {
  it('표기 변형을 별칭으로 잡고 사유를 알려준다', () => {
    const r = excludeReason('샌드아트 임혁필', new Set(['임혁필']));
    expect(r).toMatchObject({ via: 'alias', matched: '임혁필' });
  });

  it('정확히 같으면 exact, 공백 없이 붙은 직함은 prefix 로 구분한다', () => {
    expect(excludeReason('임혁필', new Set(['임혁필']))?.via).toBe('exact');
    // 공백이 있으면 토큰 별칭("송길영")이 먼저 걸린다 — 사유 라벨만 다르고 제외 결과는 같다.
    expect(excludeReason('송길영 작가', new Set(['송길영']))?.via).toBe('alias');
    // 공백 없이 붙은 형태는 별칭으로 못 나눠서 접두 비교가 담당한다.
    expect(excludeReason('송길영작가', new Set(['송길영']))?.via).toBe('prefix');
  });

  it('무관한 이름은 null', () => {
    // "이브" ↔ "아이브" 처럼 단순 부분문자열은 다른 인물이므로 제외하지 않는다.
    expect(excludeReason('이브', new Set(['아이브']))).toBeNull();
    expect(excludeReason('지민', new Set(['김지민']))).toBeNull();
  });

  it('isExcluded 는 excludeReason 과 일치한다', () => {
    const set = new Set(['임혁필', '아이브']);
    expect(isExcluded('샌드아트 임혁필', set)).toBe(true);
    expect(isExcluded('이브', set)).toBe(false);
  });
});

describe('namesOf', () => {
  it('person_name 과 제목 인물명을 둘 다 돌려준다(중복 제거)', () => {
    expect(namesOf({ person_name: '유성남', title: '[유성남 셰프 섭외] 훈남 오너셰프' })).toEqual([
      '유성남',
      '유성남셰프',
    ]);
    expect(namesOf({ person_name: '이세영', title: '[무니 섭외] 일러스트레이터' })).toEqual([
      '이세영',
      '무니',
    ]);
    expect(namesOf({ person_name: '벤', title: '[벤 섭외] 열애중' })).toEqual(['벤']);
    expect(namesOf({ person_name: null, title: null })).toEqual([]);
  });
});

describe('buildNameIndex', () => {
  const articles = [
    { person_name: '해바라기', title: '[해바라기 섭외] 포크 듀오', published_at: '2026-07-12' },
    { person_name: 'bumsup', title: '[범접 섭외] 스우파3 메가크루', published_at: '2026-07-03' },
    { person_name: '김연지', title: '[김연지 섭외] 발라드', published_at: null },
    { person_name: '이름없음', title: null, published_at: null, published_url: 'https://blog' },
  ];

  it('person_name 이 로마자여도 제목의 한글명으로 작성 이력을 잡는다', () => {
    const { written } = buildNameIndex(articles);
    expect(written.has('범접')).toBe(true);
    expect(written.has('bumsup')).toBe(true);
  });

  it('발행 집합은 published_at 또는 published_url 이 있는 인물만 담는다', () => {
    const { published } = buildNameIndex(articles);
    expect(published.has('해바라기')).toBe(true);
    expect(published.has('범접')).toBe(true);
    expect(published.has('김연지')).toBe(false); // 발행 대기
    expect(published.has('이름없음')).toBe(true); // published_url 로도 판정
  });

  it('빈 이름은 집합에 넣지 않는다', () => {
    const { written } = buildNameIndex([{ person_name: '  ', title: null }]);
    expect(written.has('')).toBe(false);
    expect(written.size).toBe(0);
  });
});

describe('fetchAll — 1000행 기본 제한 우회', () => {
  function fakeSb(totalRows: number) {
    const calls: Array<[number, number]> = [];
    const rows = Array.from({ length: totalRows }, (_, i) => ({ id: `k${i}` }));
    return {
      calls,
      from() {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.order = () => q;
        q.range = (from: number, to: number) => {
          calls.push([from, to]);
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        };
        return q;
      },
    };
  }

  it('1000행을 넘겨도 전체 행을 페이지네이션으로 가져온다', async () => {
    const sb = fakeSb(6139);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await fetchAll(sb as any, 'keywords', 'id');
    expect(rows.length).toBe(6139);
    expect(sb.calls[0]).toEqual([0, 999]);
    expect(sb.calls.length).toBe(7);
  });

  it('1000행 미만이면 한 번만 조회한다', async () => {
    const sb = fakeSb(120);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await fetchAll(sb as any, 'articles', 'id');
    expect(rows.length).toBe(120);
    expect(sb.calls.length).toBe(1);
  });

  it('error 를 그대로 던진다', async () => {
    const sb = {
      from() {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.order = () => q;
        q.range = () => Promise.resolve({ data: null, error: { message: 'boom' } });
        return q;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(fetchAll(sb as any, 'keywords', 'id')).rejects.toThrow('boom');
  });
});
