// 노출 관문 지표 — rank-gate(측정)와 gate-model(학습·점수)이 같은 정의를 쓴다.
// 둘이 어긋나면 "학습에서 본 값"과 "점수 매길 때 본 값"이 달라져 모델이 조용히 틀린다.

export const strip = (h) => String(h ?? '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ')
  .replace(/\s+/g, ' ').trim();

// 인물명은 표기가 여러 개다 — `클럽소울 (Club Soul)`, `유자 왕 (Yuja Wang)` 처럼
// 등록명 전체가 본문에 그대로 나오는 일은 거의 없다. 등록명으로만 세면 반복 횟수가
// 0~2회로 잡혀, 실제로는 평범한 원고가 "반복이 적은 글"로 분류된다(17편이 그랬다).
// 괄호 안팎을 각각 세어 큰 값을 쓴다.
export const nameVariants = (n) => {
  const s = String(n ?? '').trim();
  const m = s.match(/^(.*?)[（(]([^）)]*)[）)]/);
  const v = m ? [s, m[1].trim(), m[2].trim()] : [s];
  return v.filter((x) => x.length >= 2);
};
export const nameCount = (body, person) =>
  Math.max(0, ...nameVariants(person).map((v) => body.split(v).length - 1));

export const count = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

// d = { body, len, title, person_name }
export const FEATURES = {
  '본문 길이': (d) => d.len,
  '"섭외" 밀도': (d) => (count(d.body, '섭외') / Math.max(d.len, 1)) * 1000,
  '"섭외" 횟수': (d) => count(d.body, '섭외'),
  '인물명 밀도': (d) => (nameCount(d.body, d.person_name) / Math.max(d.len, 1)) * 1000,
  '인물명 횟수': (d) => nameCount(d.body, d.person_name),
  '실무정보어': (d) => ['비용', '견적', '문의', '일정', '출연료', '섭외료', '예산', '계약']
    .reduce((x, w) => x + count(d.body, w), 0),
  '어휘 다양성': (d) => { const t = d.body.split(/\s+/).filter(Boolean); return t.length ? new Set(t).size / t.length : 0; },
  '고유명사 다양성': (d) => new Set(d.body.match(/[가-힣]{2,}/g) ?? []).size,
  '숫자 밀도': (d) => ((d.body.match(/\d/g) ?? []).length / Math.max(d.len, 1)) * 1000,
  '제목 길이': (d) => (d.title ?? '').length,
};
