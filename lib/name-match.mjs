// 인물명 정규화 + 중복(작성/발행) 판정 공용 모듈.
//
// 이 로직은 scripts/*.mjs(키워드 추출·크롤링), app/*(키워드 페이지·계정 피드), tests 에서
// 모두 같은 결과를 내야 한다. 과거에 pick-keywords / crawl-artsro / app 이 각자 복제한
// 판정 로직이 갈라져서 "이미 발행한 인물이 다시 후보로 뽑히는" 사고가 반복됐다.
// 판정 규칙을 바꿀 때는 반드시 이 파일만 고친다. (테스트: tests/name-match.test.ts)
//
// 핵심 규칙 (docs/지침/05_랜덤_키워드_셀렉트_지침.md)
//   - 한 번이라도 원고가 만들어진 인물은 **계정을 불문하고** 후보에서 제외한다.
//   - 발행 여부의 정본은 articles(published_at / published_url)이다.
//     keywords.published_url 은 수동 입력값이라 비어 있는 경우가 대부분이므로 단독으로 믿지 않는다.

/** 괄호 주석 제거: "홍석천(강연)" → "홍석천", "정재승(카이스트(교수))" → "정재승" */
export const stripParen = (s) => String(s ?? '').replace(/[\(（].*$/s, '').trim();

/**
 * 비교용 정규화: 괄호 주석 제거 + 공백·콜론 제거 + 소문자화.
 * 콜론을 빼는 이유: "오전:오후" 처럼 이름에 콜론이 들어간 인물은 파일명에 콜론을 쓸 수 없어
 * 슬러그가 "오전오후"가 된다. 콜론을 남겨두면 같은 인물이 중복 판정을 통과해 버린다.
 */
export const norm = (s) => stripParen(s).replace(/[\s:：]+/g, '').toLowerCase();

// 원고 제목/파일명의 대괄호 안 인물명에서 떼어낼 접미어.
// "[송길영 강연 섭외]" 처럼 역할어가 겹쳐 붙는 제목이 있어 반복 매칭한다.
// 반드시 앞에 공백이 있을 때만 떼어낸다 — "[가수섭외]"(카테고리 원고)를 "가수"로 만들면
// "가수"로 시작하는 인물 키워드가 전부 제외되는 대형 오탈락이 발생한다.
const ROLE_SUFFIX = /(\s+(섭외|강연|초빙|출연))+$/;

/**
 * 원고 제목에서 인물명을 뽑는다. "[범접 섭외] ..." → "범접"
 * articles.person_name 이 로마자 슬러그(bumsup, haebara 등)로 저장된 원고가 144건 있어,
 * person_name 만으로는 한글 키워드와 매칭되지 않는다. 제목이 두 번째 신원 정보다.
 * @param {string|null|undefined} title
 * @returns {string} 정규화된 인물명 (없으면 '')
 */
export function titleName(title) {
  const m = String(title ?? '').match(/^\s*\[([^\]]+)\]/);
  if (!m) return '';
  const inner = m[1].replace(ROLE_SUFFIX, '').trim();
  // "벤", "숀" 같은 1글자 인물명이 실제로 있으므로 길이로 버리지 않는다.
  // 1글자 이름의 오탈락은 isExcluded 의 MIN_PREFIX_LEN 이 막는다(정확히 같을 때만 제외).
  return norm(inner);
}

/**
 * 파일명에서 인물명 후보를 뽑는다.
 * 패턴: "{슬러그}_[{인물명} 섭외] ....html"
 * @param {string} filename
 * @returns {string[]}
 */
export function fileNames(filename) {
  const base = String(filename ?? '');
  const out = [];
  const prefix = norm(base.split('_')[0]);
  if (prefix) out.push(prefix);
  const bracketIdx = base.indexOf('[');
  if (bracketIdx >= 0) {
    const t = titleName(base.slice(bracketIdx));
    if (t) out.push(t);
  }
  return out;
}

// 접두 비교에 쓸 최소 길이. 1글자 이름("벤", "숀")까지 접두 비교에 넣으면
// "벤티", "숀리" 같은 무관한 인물이 통째로 제외된다. 1글자는 정확히 같을 때만 제외.
const MIN_PREFIX_LEN = 2;

// 별칭 토큰에서 뺄 일반 수식어(직함·장르·편성). 이 단어가 별칭이 되면
// 같은 이름의 원고 한 건 때문에 후보가 대량 오탈락한다.
const MODIFIER_WORDS = new Set([
  '밴드', '가수', '마술사', 'dj', '테너', '소프라노', '바리톤', '트로트', '그룹', '크루', '팀',
  'mc', '아나운서', '교수', '대표', '작가', '셰프', '원장', '강사', '박사', '감독', '개그맨',
  '아티스트', '듀오', '보컬', '트리오', '콰르텟', '오케스트라', '재즈', '힙합', '국악', '댄스',
  '유튜버', '인플루언서', '코미디언', '강연자', '방송인', '연예인', '섭외',
]);

/**
 * 키워드의 표기 변형(별칭)을 모두 뽑는다.
 *
 * 같은 인물이 keywords 에 다른 표기로 들어와 있어 접두 비교로는 못 잡는 중복이 있었다.
 * 예: 이미 쓴 "키노" ↔ 후보 "팬타곤 키노", 쓴 "김하온" ↔ 후보 "HAON(김하온)".
 * 뽑는 별칭: ① 정규화 전체명 ② 괄호 안 표기 ③ 공백·&·/ 로 나눈 토큰(수식어·1글자 제외)
 *
 * @param {string|null|undefined} raw
 * @returns {string[]}
 */
export function aliasesOf(raw) {
  const s = String(raw ?? '');
  const out = new Set();
  const full = norm(s);
  if (full) out.add(full);
  for (const m of s.matchAll(/[\(（]([^\)）]+)[\)）]/g)) {
    const v = norm(m[1]);
    if (v) out.add(v);
  }
  for (const t of s.replace(/[\(（].*$/s, '').split(/[\s&·,/+]+/)) {
    const v = norm(t);
    if (v.length >= 2 && !MODIFIER_WORDS.has(v)) out.add(v);
  }
  return [...out];
}

/**
 * 키워드가 제외 집합에 걸리는 이유를 돌려준다(안 걸리면 null).
 *
 * 판정 순서: 정확히 같음(exact) → 표기 변형(alias) → 직함 붙음(prefix) → 부분 겹침(substring).
 *
 * exact 는 길이 제한 없이 항상 적용한다 — "벤"·"숀"·"츄" 같은 1글자 인물명이 실제로 있고,
 * 이들이 exact 검사조차 통과해 버리면 중복이 그대로 새어 나간다.
 * 반대로 fuzzy 비교(prefix/substring)는 양쪽 2글자 이상일 때만 한다.
 *
 * substring 은 "여자아이들"(발행) ↔ "아이들"(후보)처럼 접두사가 아니라 중간에서 겹치는
 * 그룹명을 잡는다. "이브"↔"아이브" 처럼 남남인 인물도 함께 걸려 후보를 잃지만,
 * 후보가 5,000개 넘게 남아 있는 상황에서 오탈락 비용은 중복 발행 비용보다 훨씬 작다.
 * 무엇이 왜 빠졌는지는 `pick-keywords.mjs --why` 로 확인할 수 있다.
 *
 * @param {string} name
 * @param {Set<string>} excludedSet 정규화된 **완전명** 집합
 *   (완전명만 넣는다. 기존 원고 이름까지 토큰 분해하면 "에드워드 리"의 "에드워드"가
 *    별개 인물 "에드워드 권"을 제외시키는 식으로 오탈락이 생긴다.)
 * @returns {{via: 'exact'|'alias'|'prefix'|'substring', matched: string, alias: string}|null}
 */
export function excludeReason(name, excludedSet) {
  const kn = norm(name);
  if (!kn) return null;
  if (excludedSet.has(kn)) return { via: 'exact', matched: kn, alias: kn };
  for (const alias of aliasesOf(name)) {
    if (alias !== kn && excludedSet.has(alias)) return { via: 'alias', matched: alias, alias };
  }
  if (kn.length < MIN_PREFIX_LEN) return null; // 1글자는 exact 로만 판정
  for (const ex of excludedSet) {
    if (!ex || ex.length < MIN_PREFIX_LEN) continue; // 빈 문자열/1글자는 fuzzy 비교 제외
    if (kn.startsWith(ex) || ex.startsWith(kn)) return { via: 'prefix', matched: ex, alias: kn };
    if (kn.includes(ex) || ex.includes(kn)) return { via: 'substring', matched: ex, alias: kn };
  }
  return null;
}

/**
 * 키워드가 제외 집합에 걸리는지 판정. 사유가 필요하면 excludeReason 을 쓴다.
 * @param {string} name
 * @param {Set<string>} excludedSet 정규화된 완전명 집합
 */
export function isExcluded(name, excludedSet) {
  return excludeReason(name, excludedSet) !== null;
}

/**
 * 원고 한 건이 가진 인물명 표기들(정규화). person_name 과 제목의 [인물명] 이 갈리는 경우
 * ("유성남" vs "[유성남 셰프 섭외]", "이세영" vs "[무니 섭외]") 둘 다 후보로 본다.
 * @param {{person_name?: string|null, title?: string|null}} row
 * @returns {string[]}
 */
export function namesOf(row) {
  return [...new Set([norm(row?.person_name), titleName(row?.title)].filter(Boolean))];
}

/**
 * articles 목록에서 "원고 작성됨" / "발행 완료" 인물 이름 집합을 만든다.
 * 한 원고에서 person_name 과 제목 인물명 둘 다 등록해 로마자/한글 표기 차이를 흡수한다.
 * @param {Array<{person_name?: string|null, title?: string|null, published_at?: string|null, published_url?: string|null}>} articles
 * @returns {{written: Set<string>, published: Set<string>}}
 */
export function buildNameIndex(articles) {
  const written = new Set();
  const published = new Set();
  for (const a of articles ?? []) {
    const names = namesOf(a);
    const isPublished = Boolean(a?.published_at || a?.published_url);
    for (const n of names) {
      written.add(n);
      if (isPublished) published.add(n);
    }
  }
  return { written, published };
}

const PAGE = 1000;
const MAX_PAGES = 100; // 런어웨이 방지 (최대 10만 행)

/**
 * supabase-js select 를 전체 행까지 페이지네이션한다.
 *
 * Supabase(PostgREST)는 range 를 주지 않으면 **최대 1000행만** 돌려준다.
 * keywords 6100+, articles 1100+ 규모에서 이 제한을 모르고 조회하면
 * 제외 집합과 후보 풀이 통째로 잘려 이미 발행한 인물이 다시 뽑힌다.
 *
 * @template T
 * @param {{from: (t: string) => any}} sb supabase 클라이언트
 * @param {string} table
 * @param {string} columns
 * @param {(q: any) => any} [apply] 필터/정렬 추가 (예: q => q.eq('agency','other'))
 * @returns {Promise<T[]>}
 */
export async function fetchAll(sb, table, columns, apply = (q) => q) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    // id 정렬을 마지막에 덧붙여 페이지 경계에서 행이 중복·누락되지 않게 고정한다.
    const { data, error } = await apply(sb.from(table).select(columns))
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message ?? String(error));
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
  throw new Error(`${table} 조회 페이지 상한(${MAX_PAGES}) 초과 — 필터를 좁히세요.`);
}
