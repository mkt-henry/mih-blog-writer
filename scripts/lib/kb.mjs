// 지식 그래프 적재의 순수 로직. DB·네트워크 접근 없음 — 전부 테스트된다.
//
// 여기 모으는 이유: 만료 기본값·tier 규칙·금지어처럼 틀려도 에러가 안 나고
// 조용히 나쁜 데이터가 쌓이는 것들이다. CLI 는 이 함수들의 얇은 껍데기로 둔다.

/** 출처 본문 상한. HTML 원본은 저장하지 않고 텍스트만, 그마저도 잘라 넣는다. */
export const SNAPSHOT_MAX = 60000;

export const ENTITY_KINDS = [
  'person', 'group', 'agency', 'song', 'program', 'award', 'event_type', 'genre',
];

export const EDGE_RELS = [
  'member_of', 'signed_to', 'released', 'appeared_in', 'won', 'performed_at',
  'similar_to', 'has_genre',
];

/**
 * 사실 주제별 재확인 기한(개월). null 이면 만료 없음.
 *
 * 연예인 정보는 병원 정보보다 훨씬 빠르게 낡는다 — 소속사 이동, 그룹 탈퇴, 활동 중단.
 * 공개 인물 DB 를 열었을 때 옛 정보가 떠 있는 것이 이 프로젝트 최대의 대외 리스크라
 * 잘 변하는 주제에는 반드시 기한을 붙인다.
 */
export const EXPIRY_MONTHS = {
  agency: 6,
  membership: 6,
  activity: 3,
  recent: 3,
  debut: null,
  name: null,
  song: null,
  award: null,
  past_event: null,
};

/** 출연료·비용 관련은 어떤 형태로도 저장하지 않는다. 분쟁 소재이고 지침에도 금지돼 있다. */
const FEE_WORDS = ['출연료', '개런티', '섭외비', '견적', 'fee', '원 수준', '만원'];

export function expiryFor(topic, today) {
  const months = EXPIRY_MONTHS[topic];
  if (!months) return null; // 모르는 주제는 추측하지 않고 만료 없음으로 둔다
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function claimKindFor(tier) {
  if (tier >= 1 && tier <= 3) return 'fact';
  if (tier === 4) return 'needs-check';
  return null; // tier 5 (커뮤니티·팬위키·개인블로그) 단독 근거는 적재하지 않는다
}

const looksLikeFee = (text) => FEE_WORDS.some((w) => String(text ?? '').includes(w));

export function normalizePayload(payload, today) {
  const rejected = [];

  const sources = [];
  const tierByRef = new Map();
  for (const s of payload.sources ?? []) {
    if (claimKindFor(s.tier) === null) {
      rejected.push(`출처 ${s.url}: tier 5 는 근거로 쓰지 않는다`);
      continue;
    }
    tierByRef.set(s.ref, s.tier);
    sources.push({ ...s, snapshot: s.snapshot ? s.snapshot.slice(0, SNAPSHOT_MAX) : null });
  }

  const entities = [];
  for (const e of payload.entities ?? []) {
    if (!ENTITY_KINDS.includes(e.kind)) {
      rejected.push(`엔티티 ${e.name}: 알 수 없는 kind '${e.kind}'`);
      continue;
    }
    if (e.kind === 'person' && !e.keyword_id) {
      rejected.push(`엔티티 ${e.name}: person 은 keyword_id 가 필요하다`);
      continue;
    }
    entities.push(e);
  }

  const edges = [];
  for (const g of payload.edges ?? []) {
    if (!EDGE_RELS.includes(g.rel)) {
      rejected.push(`관계 ${g.src}->${g.dst}: 알 수 없는 rel '${g.rel}'`);
      continue;
    }
    edges.push(g);
  }

  const claims = [];
  for (const c of payload.claims ?? []) {
    if (looksLikeFee(c.claim)) {
      rejected.push(`사실 "${c.claim}": 출연료·비용은 저장하지 않는다`);
      continue;
    }
    if (!c.quote) {
      rejected.push(`사실 "${c.claim}": quote 가 없으면 검증할 수 없다`);
      continue;
    }
    const tier = tierByRef.get(c.source);
    if (tier === undefined) {
      rejected.push(`사실 "${c.claim}": 쓸 수 있는 출처가 없다`);
      continue;
    }
    claims.push({
      ...c,
      kind: claimKindFor(tier),
      status: 'draft', // 적재는 언제나 draft 다. verified 로 올리는 것은 검증 에이전트의 일이다
      expires_on: c.expires_on ?? expiryFor(c.topic, today),
    });
  }

  const signals = [];
  for (const g of payload.signals ?? []) {
    if (looksLikeFee(g.metric)) {
      rejected.push(`신호 ${g.metric}: 출연료·비용은 저장하지 않는다`);
      continue;
    }
    if (g.value === null || g.value === undefined) continue; // 미수집은 0 이 아니라 없음이다
    signals.push(g);
  }

  return { sources, entities, edges, claims, signals, rejected };
}
