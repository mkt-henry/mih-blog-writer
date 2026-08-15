# 인물 지식 그래프 + 에이전트 체인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원고를 수집·검증·작성·검수 4단계로 나누고, 그 부산물로 인물 지식 그래프가 자동으로 쌓이게 한다. 원고는 검증된 사실만 근거로 쓴다.

**Architecture:** 그래프는 Supabase 에 `mih_kb_*` 4개 테이블(출처·엔티티·엣지·사실) + 신호 테이블로 둔다. 인물 노드는 기존 `keywords` 를 참조만 하고 새로 만들지 않는다. 에이전트는 `node scripts/kb.mjs <명령>` 하나로만 DB 에 접근한다(JSON in/out). 순수 로직은 `scripts/lib/kb.mjs` 에 두고 CLI 는 얇은 껍데기로 둔다. 오케스트레이터는 기존 `naver-article` 스킬을 고쳐 쓰고, **원고 본문을 오케스트레이터 컨텍스트에서 직접 쓰지 않는다.**

**Tech Stack:** Node ESM(`.mjs`), `@supabase/supabase-js`, `dotenv`, Vitest, Supabase Management API 마이그레이션, Claude Code 서브에이전트(`.claude/agents/*.md`).

**Spec:** `docs/superpowers/specs/2026-08-15-knowledge-graph-agent-chain-design.md` (§5 B — 지식 그래프, §6 C — 에이전트 체인)

## Global Constraints

- **인물 노드를 새로 만들지 않는다.** `keywords` 가 인물 명단이자 중복 판정의 원장이다. 그래프의 인물 엔티티는 `keyword_id` 로 참조만 한다.
- **원고는 `status='verified'` 인 사실만 근거로 쓴다.** `draft` 를 쓰면 검증 절차가 무의미해진다.
- **수집 에이전트는 판정하지 않고, 검증 에이전트는 수집하지 않는다.** 역할을 섞으면 자기가 만든 사실을 자기가 승인한다.
- 사실은 `quote`(출처에서 그대로 따온 문장) 없이 `verified` 로 올릴 수 없다.
- 출처 등급: 1 본인·소속사 공식 채널 / 2 포털 인물정보·음원 플랫폼·공공 / 3 보도자료 / 4 언론 기사 / 5 커뮤니티·팬위키·개인블로그. **tier 5 단독 근거는 적재하지 않는다.** tier 4 단독은 `kind='needs-check'`.
- 만료 기본값(§5.5): 소속사·그룹 멤버십 **6개월**, 활동 상태·최근 활동 **3개월**, 데뷔연도·본명·대표곡·수상·과거 출연 이력은 **만료 없음**.
- **출연료 금액은 어떤 형태로도 산출·저장·표시하지 않는다.**
- 하이브 계열(`keywords.is_active=false`)은 그래프에도 신규 적재하지 않는다.
- 실행 기록은 **오케스트레이터만** 남긴다. 서브에이전트가 자기 실행을 기록하면 죽었을 때 종료 기록이 안 남는다. **체인을 중간에 멈출 때도 그 run 을 닫는다.**
- 서브에이전트는 부모에게 **요약만** 돌려준다. 크롤 원문·전체 사실 목록·원고 본문을 올리면 컨텍스트가 터진다.
- 재작성은 **최대 2회.** 두 번 고쳐도 남으면 사용자에게 보고하고 멈춘다.
- `발행` 은 사람이 한다. 에이전트가 자동 발행하지 않는다.
- 기존 게이트는 그대로 유지한다 — 착수 전 `node scripts/check-keyword.mjs`, 발행 전 `npm run check:article`.
- 테스트는 `npm test` (vitest run). 테스트는 `tests/` 아래, 소스는 `@/` 또는 상대경로로 import.
- 마이그레이션은 `supabase/migrations/` 에 SQL 을 두고 `node scripts/apply-migration.mjs <path>` 로 적용.
- 스크립트는 `.mjs` ESM, `dotenv` 의 `config({ path: '.env.local' })` 로 환경변수를 읽는다 (`scripts/check-keyword.mjs` 패턴).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/20260816000000_create_mih_kb.sql` | 그래프 5개 테이블 |
| `supabase/migrations/20260816000001_create_mih_runs.sql` | 실행 기록 2개 테이블 |
| `scripts/lib/kb.mjs` | 순수 로직 — payload 정규화, 만료 기본값, tier 규칙, 요약 포맷. DB·네트워크 없음 |
| `scripts/kb.mjs` | CLI 껍데기. 인자 파싱 + Supabase 호출 + JSON 출력 |
| `tests/kb.test.ts` | `scripts/lib/kb.mjs` 단위 테스트 |
| `.claude/agents/mih-researcher.md` | 수집 에이전트 |
| `.claude/agents/mih-verifier.md` | 검증 에이전트 |
| `.claude/agents/mih-writer.md` | 작성 에이전트 |
| `.claude/agents/mih-reviewer.md` | 검수 에이전트 |
| `.claude/skills/naver-article/SKILL.md` | 오케스트레이터 (개조) |

---

### Task 1: 지식 그래프 스키마

**Files:**
- Create: `supabase/migrations/20260816000000_create_mih_kb.sql`

**Interfaces:**
- Consumes: 기존 `keywords(id)`
- Produces: `mih_kb_sources`, `mih_kb_entities`, `mih_kb_edges`, `mih_kb_claims`, `mih_kb_signals`

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/20260816000000_create_mih_kb.sql`:

```sql
-- 인물 지식 그래프.
--
-- 구조: 출처(sources) + 노드(entities) + 관계(edges) + 사실(claims) + 신호(signals).
-- 사실을 엔티티 attrs 에 묻지 않고 별 행으로 두는 이유는 사실 1건이 검증·유효기한·
-- 출처의 단위이기 때문이다. 검증 에이전트는 claims 만 상대한다.
--
-- 인물 노드는 여기서 새로 만들지 않는다 — keywords 가 인물 명단이자 중복 판정의 원장이고,
-- 두 원장이 갈리면 person_name 로마자/한글 사고가 재발한다. keyword_id 로 참조만 한다.

CREATE TABLE IF NOT EXISTS mih_kb_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url          text NOT NULL UNIQUE,
  title        text,
  publisher    text,
  -- 1 본인·소속사 공식 / 2 포털 인물정보·음원 플랫폼·공공 / 3 보도자료 / 4 언론 기사 / 5 커뮤니티
  tier         smallint NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  content_hash text,
  -- 본문 텍스트만. HTML 원본은 저장하지 않는다(용량 사고 방지). 상한은 scripts/lib/kb.mjs.
  snapshot     text
);

CREATE TABLE IF NOT EXISTS mih_kb_entities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- person 이면 필수. 그 외 kind 는 NULL.
  keyword_id  uuid REFERENCES keywords(id) ON DELETE CASCADE,
  kind        text NOT NULL,   -- person|group|agency|song|program|award|event_type|genre
  name        text NOT NULL,
  aliases     text[],
  summary     text,
  attrs       jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'draft',
  review_after date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 같은 종류·같은 이름은 한 노드다. event_type·genre 는 고정 목록이라 전역 유일해야 한다.
CREATE UNIQUE INDEX IF NOT EXISTS mih_kb_entities_key_idx
  ON mih_kb_entities (kind, name);
CREATE INDEX IF NOT EXISTS mih_kb_entities_keyword_idx
  ON mih_kb_entities (keyword_id) WHERE keyword_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mih_kb_edges (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src    uuid NOT NULL REFERENCES mih_kb_entities(id) ON DELETE CASCADE,
  dst    uuid NOT NULL REFERENCES mih_kb_entities(id) ON DELETE CASCADE,
  -- member_of|signed_to|released|appeared_in|won|performed_at|similar_to|has_genre
  rel    text NOT NULL,
  attrs  jsonb NOT NULL DEFAULT '{}',
  note   text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (src, dst, rel)
);
CREATE INDEX IF NOT EXISTS mih_kb_edges_src_idx ON mih_kb_edges (src);
CREATE INDEX IF NOT EXISTS mih_kb_edges_dst_idx ON mih_kb_edges (dst);

-- 사실 1건 = 1행. 검증 단위.
CREATE TABLE IF NOT EXISTS mih_kb_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid REFERENCES mih_kb_entities(id) ON DELETE CASCADE,
  edge_id     uuid REFERENCES mih_kb_edges(id) ON DELETE CASCADE,
  claim       text NOT NULL,
  kind        text NOT NULL DEFAULT 'fact',   -- fact | needs-check
  source_id   uuid REFERENCES mih_kb_sources(id),
  quote       text,                            -- 출처에서 그대로 따온 문장
  status      text NOT NULL DEFAULT 'draft',   -- draft|verified|rejected|conflict|stale
  confidence  smallint,
  verified_at timestamptz,
  expires_on  date,
  note        text,                            -- rejected/conflict 사유. 재수집 낭비 방지
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mih_kb_claims_key_idx
  ON mih_kb_claims (entity_id, claim) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS mih_kb_claims_entity_idx ON mih_kb_claims (entity_id, status);
CREATE INDEX IF NOT EXISTS mih_kb_claims_expiry_idx ON mih_kb_claims (expires_on)
  WHERE expires_on IS NOT NULL;

-- 신호. 점수를 저장하지 않는다 — 근거 수치만 담고, 화면과 추천은 이 값을 그대로 보여준다.
-- 미수집은 행을 만들지 않는다(0 으로 채우지 않는다). 없는 것과 0 은 다르다.
CREATE TABLE IF NOT EXISTS mih_kb_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid NOT NULL REFERENCES mih_kb_entities(id) ON DELETE CASCADE,
  metric      text NOT NULL,
  value       numeric,
  unit        text,
  source_id   uuid REFERENCES mih_kb_sources(id),
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mih_kb_signals_entity_idx
  ON mih_kb_signals (entity_id, metric, observed_at DESC);
```

- [ ] **Step 2: Apply the migration**

Run: `node scripts/apply-migration.mjs supabase/migrations/20260816000000_create_mih_kb.sql`
Expected: `✓ 적용 완료`

- [ ] **Step 3: Verify all five tables exist**

```bash
cat > scripts/_tmp-verify.mjs <<'EOF'
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
for (const t of ['mih_kb_sources','mih_kb_entities','mih_kb_edges','mih_kb_claims','mih_kb_signals']) {
  const { error, count } = await s.from(t).select('*', { count: 'exact', head: true });
  console.log(error ? `FAIL ${t}: ${error.message}` : `OK ${t}: ${count} rows`);
}
EOF
node --env-file=.env.local scripts/_tmp-verify.mjs; rm -f scripts/_tmp-verify.mjs
```

Expected: 다섯 줄 모두 `OK ... 0 rows`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260816000000_create_mih_kb.sql
git commit -m "feat(kb): add person knowledge graph tables"
```

---

### Task 2: KB 순수 로직 (`scripts/lib/kb.mjs`)

CLI 가 얇아야 테스트가 가능하다. 만료 기본값·tier 규칙·payload 정규화처럼 **틀리면 조용히 나쁜 데이터가 쌓이는 로직**을 여기 모으고 전부 테스트한다.

**Files:**
- Create: `scripts/lib/kb.mjs`
- Test: `tests/kb.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `const SNAPSHOT_MAX = 60000`
  - `const ENTITY_KINDS: string[]`, `const EDGE_RELS: string[]`
  - `const EXPIRY_MONTHS: Record<string, number|null>` — 사실 주제별 만료 개월 수
  - `expiryFor(topic: string, today: string): string | null`
  - `claimKindFor(tier: number): 'fact' | 'needs-check' | null` — `null` 이면 적재 거부
  - `normalizePayload(payload: object, today: string): { sources, entities, edges, claims, signals, rejected: string[] }`

- [ ] **Step 1: Write the failing test**

`tests/kb.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  SNAPSHOT_MAX,
  ENTITY_KINDS,
  EDGE_RELS,
  expiryFor,
  claimKindFor,
  normalizePayload,
} from '../scripts/lib/kb.mjs';

const TODAY = '2026-08-16';

describe('ENTITY_KINDS / EDGE_RELS', () => {
  it('covers the spec node kinds', () => {
    expect(ENTITY_KINDS).toEqual([
      'person', 'group', 'agency', 'song', 'program', 'award', 'event_type', 'genre',
    ]);
  });

  it('covers the spec relations', () => {
    expect(EDGE_RELS).toEqual([
      'member_of', 'signed_to', 'released', 'appeared_in', 'won', 'performed_at',
      'similar_to', 'has_genre',
    ]);
  });
});

describe('expiryFor', () => {
  it('expires agency and group membership in 6 months', () => {
    expect(expiryFor('agency', TODAY)).toBe('2027-02-16');
    expect(expiryFor('membership', TODAY)).toBe('2027-02-16');
  });

  it('expires activity facts in 3 months', () => {
    expect(expiryFor('activity', TODAY)).toBe('2026-11-16');
    expect(expiryFor('recent', TODAY)).toBe('2026-11-16');
  });

  it('never expires immutable facts', () => {
    expect(expiryFor('debut', TODAY)).toBeNull();
    expect(expiryFor('song', TODAY)).toBeNull();
    expect(expiryFor('award', TODAY)).toBeNull();
    expect(expiryFor('past_event', TODAY)).toBeNull();
  });

  it('treats an unknown topic as immutable rather than guessing', () => {
    expect(expiryFor('무엇인가', TODAY)).toBeNull();
  });
});

describe('claimKindFor', () => {
  it('accepts tier 1-3 as plain facts', () => {
    expect(claimKindFor(1)).toBe('fact');
    expect(claimKindFor(2)).toBe('fact');
    expect(claimKindFor(3)).toBe('fact');
  });

  it('marks tier 4 as needs-check', () => {
    expect(claimKindFor(4)).toBe('needs-check');
  });

  it('refuses tier 5 outright', () => {
    expect(claimKindFor(5)).toBeNull();
  });
});

describe('normalizePayload', () => {
  const base = () => ({
    sources: [{ ref: 'ig', url: 'https://instagram.com/x', tier: 1, snapshot: 'a'.repeat(70000) }],
    entities: [{ ref: 'p', kind: 'person', name: '아이유', keyword_id: 'k1' }],
    edges: [{ src: 'p', dst: 'g', rel: 'has_genre' }],
    claims: [{ entity: 'p', claim: '소속사는 이담', source: 'ig', quote: '이담엔터', topic: 'agency' }],
    signals: [{ entity: 'p', metric: 'instagram_followers', value: 320000 }],
  });

  it('truncates the snapshot to the cap', () => {
    const out = normalizePayload(base(), TODAY);
    expect(out.sources[0].snapshot).toHaveLength(SNAPSHOT_MAX);
  });

  it('applies the expiry default from the claim topic', () => {
    const out = normalizePayload(base(), TODAY);
    expect(out.claims[0].expires_on).toBe('2027-02-16');
  });

  it('keeps an explicit expires_on over the default', () => {
    const p = base();
    p.claims[0].expires_on = '2026-12-31';
    expect(normalizePayload(p, TODAY).claims[0].expires_on).toBe('2026-12-31');
  });

  it('always loads claims as draft even if the caller says verified', () => {
    const p = base();
    p.claims[0].status = 'verified';
    expect(normalizePayload(p, TODAY).claims[0].status).toBe('draft');
  });

  it('drops tier 5 sources and every claim resting on them', () => {
    const p = base();
    p.sources[0].tier = 5;
    const out = normalizePayload(p, TODAY);
    expect(out.sources).toHaveLength(0);
    expect(out.claims).toHaveLength(0);
    expect(out.rejected.join(' ')).toContain('tier 5');
  });

  it('marks claims from tier 4 sources as needs-check', () => {
    const p = base();
    p.sources[0].tier = 4;
    expect(normalizePayload(p, TODAY).claims[0].kind).toBe('needs-check');
  });

  it('rejects an unknown entity kind instead of writing it', () => {
    const p = base();
    p.entities[0].kind = '가수님';
    const out = normalizePayload(p, TODAY);
    expect(out.entities).toHaveLength(0);
    expect(out.rejected.join(' ')).toContain('kind');
  });

  it('rejects an unknown relation', () => {
    const p = base();
    p.edges[0].rel = '친함';
    const out = normalizePayload(p, TODAY);
    expect(out.edges).toHaveLength(0);
    expect(out.rejected.join(' ')).toContain('rel');
  });

  it('requires keyword_id on a person entity', () => {
    const p = base();
    delete p.entities[0].keyword_id;
    const out = normalizePayload(p, TODAY);
    expect(out.entities).toHaveLength(0);
    expect(out.rejected.join(' ')).toContain('keyword_id');
  });

  it('does not require keyword_id on non-person entities', () => {
    const p = base();
    p.entities[0] = { ref: 'g', kind: 'genre', name: '발라드' };
    expect(normalizePayload(p, TODAY).entities).toHaveLength(1);
  });

  it('drops a claim with no quote — it can never be verified', () => {
    const p = base();
    delete p.claims[0].quote;
    const out = normalizePayload(p, TODAY);
    expect(out.claims).toHaveLength(0);
    expect(out.rejected.join(' ')).toContain('quote');
  });

  it('drops a signal with no numeric value rather than storing zero', () => {
    const p = base();
    p.signals[0].value = null;
    const out = normalizePayload(p, TODAY);
    expect(out.signals).toHaveLength(0);
  });

  it('refuses any signal or claim that looks like a fee amount', () => {
    const p = base();
    p.signals.push({ entity: 'p', metric: 'fee_estimate', value: 5000000 });
    p.claims.push({ entity: 'p', claim: '출연료는 500만원 수준', source: 'ig', quote: '500만원', topic: 'fee' });
    const out = normalizePayload(p, TODAY);
    expect(out.signals.some((s) => s.metric === 'fee_estimate')).toBe(false);
    expect(out.claims.some((c) => c.claim.includes('출연료'))).toBe(false);
    expect(out.rejected.join(' ')).toContain('출연료');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kb.test.ts`
Expected: FAIL — Cannot find module `../scripts/lib/kb.mjs`

- [ ] **Step 3: Write minimal implementation**

`scripts/lib/kb.mjs`:

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/kb.test.ts`
Expected: PASS — 전부 통과

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/kb.mjs tests/kb.test.ts
git commit -m "feat(kb): payload rules — tier gate, expiry defaults, fee ban"
```

---

### Task 3: KB CLI — 적재와 조회

**Files:**
- Create: `scripts/kb.mjs`

**Interfaces:**
- Consumes: `scripts/lib/kb.mjs`, `@supabase/supabase-js`, `dotenv`
- Produces: CLI 명령 `brief` `put` `status` `stale` `conflicts`. 출력은 항상 JSON 한 덩어리.

```
node scripts/kb.mjs brief --person="아이유"        # 원고용 근거 (verified 만)
node scripts/kb.mjs put < payload.json             # 출처·엔티티·엣지·사실·신호 적재
node scripts/kb.mjs status < updates.json          # draft → verified/rejected/conflict
node scripts/kb.mjs stale [--person=이름]          # 재검증 대기 (draft·expired·review)
node scripts/kb.mjs conflicts [--person=이름]      # 충돌 목록
```

이 파일은 단위 테스트를 두지 않는다 — 순수 로직은 전부 Task 2 로 빠졌고 남은 것은
Supabase 호출을 감싸는 껍데기다. 검증은 Task 9 의 실제 실행으로 한다.

- [ ] **Step 1: Write the CLI**

`scripts/kb.mjs`:

```javascript
// 지식 그래프 접근 창구. 에이전트는 DB 에 직접 붙지 않고 이 하나만 쓴다.
//
//   node scripts/kb.mjs brief --person="아이유"
//   node scripts/kb.mjs put < payload.json
//   node scripts/kb.mjs status < updates.json
//   node scripts/kb.mjs stale [--person=이름]
//   node scripts/kb.mjs conflicts [--person=이름]
//
// 출력은 언제나 JSON 한 덩어리다(에이전트가 파싱한다).

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { normalizePayload } from './lib/kb.mjs';

config({ path: '.env.local' });

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const [cmd, ...rest] = process.argv.slice(2);
const arg = (name) => rest.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const today = () => new Date().toISOString().slice(0, 10);

// 출력하고 그 자리에서 끝낸다. 출력 후 아래 코드가 계속 돌아 JSON 이 두 번 찍히면
// 에이전트의 파싱이 깨진다.
const out = (o) => { console.log(JSON.stringify(o, null, 2)); process.exit(0); };
const fail = (msg) => { console.error(msg); process.exit(1); };

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** 인물 이름 → keywords 행. 그래프의 인물 노드는 여기에 매달린다. */
async function findKeyword(name) {
  const { data, error } = await db.from('keywords').select('id, keyword, category, is_active')
    .eq('keyword', name.trim()).limit(1);
  if (error) fail(`keywords 조회 실패: ${error.message}`);
  return data?.[0] ?? null;
}

async function personEntity(name) {
  const kw = await findKeyword(name);
  if (!kw) return { kw: null, entity: null };
  const { data } = await db.from('mih_kb_entities').select('*')
    .eq('kind', 'person').eq('keyword_id', kw.id).limit(1);
  return { kw, entity: data?.[0] ?? null };
}

if (cmd === 'brief') {
  const name = arg('person') ?? fail('--person=이름 이 필요하다');
  const { kw, entity } = await personEntity(name);
  if (!kw) out({ person: name, found: false, note: 'keywords 에 없는 인물' });
  else if (!entity) out({ person: name, keyword_id: kw.id, category: kw.category, entities: 0, verified: [], signals: [], pending: 0 });
  else {
    const { data: claims } = await db.from('mih_kb_claims')
      .select('id, claim, status, kind, quote, expires_on, source_id, mih_kb_sources(url, tier)')
      .eq('entity_id', entity.id);
    const { data: signals } = await db.from('mih_kb_signals')
      .select('metric, value, unit, observed_at').eq('entity_id', entity.id)
      .order('observed_at', { ascending: false });
    const { data: edges } = await db.from('mih_kb_edges')
      .select('rel, note, dst, mih_kb_entities!mih_kb_edges_dst_fkey(kind, name)').eq('src', entity.id);
    const verified = (claims ?? []).filter((c) => c.status === 'verified');
    out({
      person: name, keyword_id: kw.id, category: kw.category, entity_id: entity.id,
      counts: {
        verified: verified.length,
        draft: (claims ?? []).filter((c) => c.status === 'draft').length,
        conflict: (claims ?? []).filter((c) => c.status === 'conflict').length,
      },
      verified: verified.map((c) => ({ claim: c.claim, kind: c.kind, source: c.mih_kb_sources?.url, tier: c.mih_kb_sources?.tier })),
      edges: (edges ?? []).map((e) => ({ rel: e.rel, target: e.mih_kb_entities?.name, kind: e.mih_kb_entities?.kind, note: e.note })),
      signals: signals ?? [],
    });
  }
} else if (cmd === 'put') {
  const payload = await readStdin();
  const norm = normalizePayload(payload, today());

  const srcId = new Map();
  for (const s of norm.sources) {
    const { data, error } = await db.from('mih_kb_sources')
      .upsert({ url: s.url, title: s.title, publisher: s.publisher, tier: s.tier, snapshot: s.snapshot, fetched_at: new Date().toISOString() }, { onConflict: 'url' })
      .select('id').single();
    if (error) fail(`출처 적재 실패: ${error.message}`);
    srcId.set(s.ref, data.id);
  }

  const entId = new Map();
  for (const e of norm.entities) {
    const { data, error } = await db.from('mih_kb_entities')
      .upsert({ keyword_id: e.keyword_id ?? null, kind: e.kind, name: e.name, aliases: e.aliases ?? null, summary: e.summary ?? null, attrs: e.attrs ?? {}, updated_at: new Date().toISOString() }, { onConflict: 'kind,name' })
      .select('id').single();
    if (error) fail(`엔티티 적재 실패: ${error.message}`);
    entId.set(e.ref, data.id);
  }

  let edgesIn = 0;
  for (const g of norm.edges) {
    const src = entId.get(g.src) ?? g.src;
    const dst = entId.get(g.dst) ?? g.dst;
    const { error } = await db.from('mih_kb_edges')
      .upsert({ src, dst, rel: g.rel, attrs: g.attrs ?? {}, note: g.note ?? null }, { onConflict: 'src,dst,rel' });
    if (error) fail(`관계 적재 실패: ${error.message}`);
    edgesIn += 1;
  }

  // 사실은 엔티티에만 붙인다. 관계에 붙는 사실은 이번 범위 밖이다(컬럼은 두되 쓰지 않는다) —
  // 관계를 가리키는 참조 표기를 에이전트에게 요구할 만한 값이 아직 없다.
  let claimsIn = 0;
  for (const c of norm.claims) {
    const { error } = await db.from('mih_kb_claims').upsert({
      entity_id: entId.get(c.entity) ?? c.entity,
      claim: c.claim, kind: c.kind, source_id: srcId.get(c.source) ?? null,
      quote: c.quote, status: 'draft', expires_on: c.expires_on,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'entity_id,claim' });
    if (error) fail(`사실 적재 실패: ${error.message}`);
    claimsIn += 1;
  }

  let signalsIn = 0;
  for (const g of norm.signals) {
    const { error } = await db.from('mih_kb_signals').insert({
      entity_id: entId.get(g.entity) ?? g.entity, metric: g.metric,
      value: g.value, unit: g.unit ?? null, source_id: srcId.get(g.source) ?? null,
    });
    if (error) fail(`신호 적재 실패: ${error.message}`);
    signalsIn += 1;
  }

  out({ ok: true, sources: norm.sources.length, entities: norm.entities.length, edges: edgesIn, claims: claimsIn, signals: signalsIn, rejected: norm.rejected });
} else if (cmd === 'status') {
  const { updates } = await readStdin();
  const done = [];
  for (const u of updates ?? []) {
    const patch = { status: u.status, updated_at: new Date().toISOString() };
    if (u.status === 'verified') { patch.verified_at = new Date().toISOString(); patch.confidence = u.confidence ?? null; }
    if (u.quote) patch.quote = u.quote;
    if (u.note) patch.note = u.note;
    if (u.expires_on) patch.expires_on = u.expires_on;
    const { error } = await db.from('mih_kb_claims').update(patch).eq('id', u.id);
    if (error) fail(`상태 전이 실패 (${u.id}): ${error.message}`);
    done.push({ id: u.id, status: u.status });
  }
  const counts = {};
  for (const d of done) counts[d.status] = (counts[d.status] ?? 0) + 1;
  out({ ok: true, updated: done.length, counts });
} else if (cmd === 'stale') {
  const name = arg('person');
  let q = db.from('mih_kb_claims')
    .select('id, claim, status, quote, expires_on, note, entity_id, mih_kb_sources(url, tier), mih_kb_entities(name, kind, keyword_id)');
  if (name) {
    const { entity } = await personEntity(name);
    if (!entity) out({ person: name, rows: [] });
    else q = q.eq('entity_id', entity.id);
  }
  const { data, error } = await q.in('status', ['draft', 'stale']);
  if (error) fail(`stale 조회 실패: ${error.message}`);
  const t = today();
  const rows = (data ?? []).map((c) => ({
    id: c.id, claim: c.claim, quote: c.quote, note: c.note,
    entity: c.mih_kb_entities?.name, source: c.mih_kb_sources?.url, tier: c.mih_kb_sources?.tier,
    reason: c.status === 'stale' ? 'stale' : c.expires_on && c.expires_on < t ? 'expired' : 'draft',
  }));
  out({ person: name ?? null, count: rows.length, rows });
} else if (cmd === 'conflicts') {
  const name = arg('person');
  let q = db.from('mih_kb_claims').select('id, claim, note, mih_kb_entities(name)').eq('status', 'conflict');
  if (name) {
    const { entity } = await personEntity(name);
    if (!entity) out({ person: name, rows: [] });
    else q = q.eq('entity_id', entity.id);
  }
  const { data, error } = await q;
  if (error) fail(`conflicts 조회 실패: ${error.message}`);
  out({ count: data?.length ?? 0, rows: data ?? [] });
} else {
  fail('명령: brief | put | status | stale | conflicts');
}
```

- [ ] **Step 2: Smoke-test each command against the real DB**

인물 하나로 왕복을 돌린다. `<인물명>` 은 `keywords` 에 있는 이름으로 바꾼다.

```bash
node scripts/kb.mjs brief --person="아이유"
```

Expected: `{"person":"아이유", ..., "entities":0, "verified":[], ...}` (아직 비어 있음) 또는 `found:false`

- [ ] **Step 3: Round-trip a payload**

```bash
node scripts/kb.mjs brief --person="아이유" > /tmp/kb-kw.json
cat /tmp/kb-kw.json
```

위 출력의 `keyword_id` 값을 아래 `<KEYWORD_ID>` 에 넣고 실행한다.

```bash
node scripts/kb.mjs put <<'JSON'
{
  "sources": [{ "ref": "t", "url": "https://example.com/kb-smoke", "title": "스모크", "tier": 2, "snapshot": "본문" }],
  "entities": [{ "ref": "p", "kind": "person", "name": "아이유", "keyword_id": "<KEYWORD_ID>" }],
  "claims": [{ "entity": "p", "claim": "스모크 테스트 사실", "source": "t", "quote": "본문", "topic": "debut" }],
  "signals": [{ "entity": "p", "metric": "instagram_followers", "value": 1 }]
}
JSON
node scripts/kb.mjs stale --person="아이유"
```

Expected: `put` 이 `claims:1 signals:1 rejected:[]`, `stale` 이 그 사실 1건을 `reason:"draft"` 로 보여준다.

- [ ] **Step 4: Transition and clean up the smoke row**

`stale` 출력의 `id` 를 `<CLAIM_ID>` 에 넣는다.

```bash
node scripts/kb.mjs status <<'JSON'
{ "updates": [{ "id": "<CLAIM_ID>", "status": "verified", "confidence": 90 }] }
JSON
node scripts/kb.mjs brief --person="아이유"
```

Expected: `brief` 의 `counts.verified` 가 1, `verified[0].claim` 이 `"스모크 테스트 사실"`

스모크 행을 지운다.

```bash
cat > scripts/_tmp-clean.mjs <<'EOF'
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
await s.from('mih_kb_claims').delete().eq('claim', '스모크 테스트 사실');
await s.from('mih_kb_sources').delete().eq('url', 'https://example.com/kb-smoke');
console.log('cleaned');
EOF
node --env-file=.env.local scripts/_tmp-clean.mjs; rm -f scripts/_tmp-clean.mjs
```

- [ ] **Step 5: Commit**

```bash
git add scripts/kb.mjs
git commit -m "feat(kb): single CLI entry for graph read and write"
```

---

### Task 4: 실행 기록

**Files:**
- Create: `supabase/migrations/20260816000001_create_mih_runs.sql`
- Modify: `scripts/kb.mjs` (`run-put` 명령 추가)

**Interfaces:**
- Consumes: 기존 `keywords(id)`
- Produces: 테이블 `mih_runs`, `mih_run_steps`; CLI 명령 `run-put`

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260816000001_create_mih_runs.sql`:

```sql
-- 체인 실행 기록. 어느 인물이 지금 어느 단계인지, 검증에서 몇 건이 걸렸는지 밖에서 본다.
--
-- 기록은 오케스트레이터만 남긴다 — 서브에이전트가 자기 실행을 기록하면
-- 실패로 죽었을 때 종료 기록이 안 남아 "응답 없음"으로 영영 남는다.

CREATE TABLE IF NOT EXISTS mih_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid REFERENCES keywords(id) ON DELETE SET NULL,
  person     text,
  agency     text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz
);

CREATE TABLE IF NOT EXISTS mih_run_steps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     uuid NOT NULL REFERENCES mih_runs(id) ON DELETE CASCADE,
  step       text NOT NULL,   -- 수집 | 검증 | 작성 | 검수
  agent      text,
  attempt    smallint NOT NULL DEFAULT 1,
  status     text NOT NULL DEFAULT 'running',  -- running | done | failed
  metrics    jsonb NOT NULL DEFAULT '{}',
  note       text,
  slug       text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz
);

CREATE INDEX IF NOT EXISTS mih_run_steps_run_idx ON mih_run_steps (run_id, started_at);
CREATE INDEX IF NOT EXISTS mih_runs_started_idx  ON mih_runs (started_at DESC);
```

- [ ] **Step 2: Apply and verify**

```bash
node scripts/apply-migration.mjs supabase/migrations/20260816000001_create_mih_runs.sql
```

Expected: `✓ 적용 완료`

- [ ] **Step 3: Add the `run-put` command**

`scripts/kb.mjs` 의 마지막 `} else {` 바로 앞에 아래 분기를 넣는다.

```javascript
} else if (cmd === 'run-put') {
  // 단계 시작: { run?, person, agency, step, agent, attempt?, slug? } → { run, step }
  // 단계 종료: { step: "<step id>", status: "done"|"failed", metrics?, note? }
  const p = await readStdin();
  if (p.status) {
    const { error } = await db.from('mih_run_steps')
      .update({ status: p.status, metrics: p.metrics ?? {}, note: p.note ?? null, ended_at: new Date().toISOString() })
      .eq('id', p.step);
    if (error) fail(`단계 종료 실패: ${error.message}`);
    if (p.status === 'failed' || p.last) {
      const { data } = await db.from('mih_run_steps').select('run_id').eq('id', p.step).single();
      if (data) await db.from('mih_runs').update({ ended_at: new Date().toISOString() }).eq('id', data.run_id);
    }
    out({ ok: true, step: p.step, status: p.status });
  } else {
    let runId = p.run;
    if (!runId) {
      const kw = p.person ? await findKeyword(p.person) : null;
      const { data, error } = await db.from('mih_runs')
        .insert({ keyword_id: kw?.id ?? null, person: p.person ?? null, agency: p.agency ?? null })
        .select('id').single();
      if (error) fail(`run 시작 실패: ${error.message}`);
      runId = data.id;
    }
    const { data, error } = await db.from('mih_run_steps')
      .insert({ run_id: runId, step: p.step, agent: p.agent ?? null, attempt: p.attempt ?? 1, slug: p.slug ?? null })
      .select('id').single();
    if (error) fail(`단계 시작 실패: ${error.message}`);
    out({ ok: true, run: runId, step: data.id });
  }
```

- [ ] **Step 4: Smoke-test the run record**

```bash
node scripts/kb.mjs run-put <<'JSON'
{ "person": "아이유", "agency": "mih_casting", "step": "수집", "agent": "mih-researcher" }
JSON
```

Expected: `{"ok":true,"run":"<uuid>","step":"<uuid>"}`. 그 `step` 값으로 닫는다.

```bash
node scripts/kb.mjs run-put <<'JSON'
{ "step": "<STEP_ID>", "status": "done", "metrics": { "entities": 3, "claims": 9, "sources": 2 } }
JSON
```

Expected: `{"ok":true,"step":"...","status":"done"}`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260816000001_create_mih_runs.sql scripts/kb.mjs
git commit -m "feat(kb): chain run tracking"
```

---

### Task 5: 수집 에이전트

**Files:**
- Create: `.claude/agents/mih-researcher.md`

**Interfaces:**
- Consumes: `scripts/kb.mjs brief|put`, `scripts/collect-instagram-images.js`
- Produces: 서브에이전트 `mih-researcher`. 반환은 요약 텍스트 한 덩어리(아래 형식 고정)

- [ ] **Step 1: Write the agent**

`.claude/agents/mih-researcher.md`:

```markdown
---
name: mih-researcher
description: 인물 지식 수집 전문. 웹 검색과 공식 SNS 로 사실을 모아 지식 그래프에 draft 로 적재한다. naver-article 체인의 수집 단계에서 호출된다. 판정하지 않는다.
tools: WebFetch, WebSearch, Bash, Read, Glob, Grep
---

# 자료 수집 에이전트

인물 지식 그래프(`mih_kb_*`)를 채우는 일만 한다. **판정하지 않는다** — 모든 사실은
`draft` 로 들어가고, `verified` 로 올리는 것은 `mih-verifier` 의 일이다.

넘겨받는 것: 인물명, `keyword_id`, 카테고리(가수/강연자 등), 발행 계정.

## 출처 등급

| tier | 무엇 |
| --- | --- |
| 1 | 본인·소속사 공식 채널 (공식 인스타·공식 유튜브·소속사 공지) |
| 2 | 포털 인물정보, 음원 플랫폼(멜론·지니) 아티스트 페이지, 공공·협회 자료 |
| 3 | 보도자료 |
| 4 | 언론 기사 |
| 5 | 커뮤니티·팬 위키·개인 블로그 |

**tier 1~2 를 우선한다.** tier 4 만 근거인 사실은 자동으로 `needs-check` 가 된다.
**tier 5 는 넣지 않는다** — `put` 이 거부하고 `rejected` 에 이유를 돌려준다.

## 무엇을 모으나

### 사실 (claims) — 검증 대상

각 사실에는 **출처에서 그대로 따온 문장(`quote`)을 반드시 붙인다.** quote 가 없으면
적재가 거부된다 — 검증할 방법이 없기 때문이다.

`topic` 은 재확인 기한을 정한다. 반드시 하나를 고른다.

| topic | 무엇 | 기한 |
| --- | --- | --- |
| `agency` | 소속사 | 6개월 |
| `membership` | 그룹 소속·탈퇴 | 6개월 |
| `activity` | 활동 상태(활동 중·중단·군복무) | 3개월 |
| `recent` | 최근 활동·컴백 | 3개월 |
| `debut` | 데뷔연도 | 없음 |
| `name` | 본명·개명 | 없음 |
| `song` | 대표곡 | 없음 |
| `award` | 수상 | 없음 |
| `past_event` | 과거 출연 행사 | 없음 |

### 노드와 관계

| kind | 예 |
| --- | --- |
| `person` | 인물 본인. `keyword_id` 필수 |
| `group` | 소속 그룹 |
| `agency` | 소속사 |
| `song` | 대표곡 |
| `program` | 방송·프로그램 |
| `award` | 수상 |
| `event_type` | 대학축제·기업행사·지역축제·페스티벌·프라이빗 (이 다섯만) |
| `genre` | 발라드·힙합·트로트·아이돌·강연 등 |

`rel` 은 `member_of`(인물→그룹), `signed_to`(→소속사), `released`(→곡),
`appeared_in`(→프로그램), `won`(→수상), `performed_at`(→행사유형),
`similar_to`(→인물), `has_genre`(→장르) 중 하나다.

**`performed_at` 은 기사로 확인된 실제 출연 이력만 넣는다.** "어울릴 것 같다"는 추정은
사실이 아니다. 추정을 넣으면 나중 추천 서비스가 그것을 근거로 답한다.

### 신호 (signals) — 추천의 재료

숫자만 담는다. **점수를 매기지 않는다.**

`instagram_followers`, `youtube_views_median`, `youtube_last_upload_days`,
`recent_activity_12m`, `article_count_12m`, `debut_year`,
`event_type_count:대학축제` 처럼 행사 유형별 확인된 출연 횟수.

**모르면 넣지 않는다.** 0 으로 채우면 "정보 없음"과 "해당 없음"이 구분되지 않아
신인이 전부 부적합으로 깔린다.

**출연료·비용은 어떤 형태로도 넣지 않는다.** `put` 이 거부한다.

## 절차

1. 이미 있는 것부터 본다. 같은 것을 다시 만들지 않는다.

```bash
node scripts/kb.mjs brief --person="<인물명>"
```

2. 공식 인스타그램·공식 유튜브·소속사 페이지를 WebFetch 로 읽는다.
3. 포털 인물정보·음원 플랫폼·기사를 WebSearch 로 5회 이상 찾는다.
   **학습 데이터만으로 프로필을 쓰지 않는다.**
4. 이미지 4개를 확보한다.

```bash
node scripts/collect-instagram-images.js <handle>
```

   수집한 이미지는 Read 로 본인·적합성을 눈으로 확인한 뒤 4개를 고른다. 인스타에 본인
   단독 사진이 부족하면 **보도자료를 제외한 기타 이미지**로 채운다 —
   이미지가 부족하다고 작성을 중단하지 않는다.

5. `put` 으로 적재한다. **출처 페이지 단위로 나눠 넣는다** — 중간에 실패해도 앞의 것은 남는다.

```bash
node scripts/kb.mjs put <<'JSON'
{
  "sources": [
    { "ref": "ig", "url": "https://www.instagram.com/…", "title": "공식 인스타그램",
      "publisher": "본인", "tier": 1, "snapshot": "…본문 텍스트…" }
  ],
  "entities": [
    { "ref": "p", "kind": "person", "name": "<인물명>", "keyword_id": "<넘겨받은 값>",
      "summary": "한 줄 소개" },
    { "ref": "g", "kind": "genre", "name": "발라드" }
  ],
  "edges": [ { "src": "p", "dst": "g", "rel": "has_genre" } ],
  "claims": [
    { "entity": "p", "claim": "2015년 데뷔했다", "source": "ig",
      "quote": "2015년 데뷔", "topic": "debut" }
  ],
  "signals": [ { "entity": "p", "metric": "instagram_followers", "value": 320000, "source": "ig" } ]
}
JSON
```

## 돌려줄 것

부모에게는 **요약만** 돌려준다. 크롤 본문·전체 사실 목록을 그대로 올리면 컨텍스트가 터진다.

```
출처 5건 (tier1:2 tier2:2 tier4:1)
엔티티 9건 / 관계 6건
사실 23건 draft 적재 (needs-check 2건)
신호 6건
이미지 4장 확보: <경로 4개>
거부됨: <put 응답의 rejected 를 그대로>
확인 못 한 것: 2026년 소속사 (공식 채널에 언급 없음)
```
```

- [ ] **Step 2: Verify the agent is registered**

Claude Code 를 재시작하거나 새 세션에서 서브에이전트 목록에 `mih-researcher` 가 보이는지 확인한다.
frontmatter 의 `name` 과 파일명이 어긋나면 등록되지 않는다.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/mih-researcher.md
git commit -m "feat(chain): add research agent"
```

---

### Task 6: 검증 에이전트

**Files:**
- Create: `.claude/agents/mih-verifier.md`

**Interfaces:**
- Consumes: `scripts/kb.mjs stale|status|conflicts`
- Produces: 서브에이전트 `mih-verifier`

- [ ] **Step 1: Write the agent**

`.claude/agents/mih-verifier.md`:

```markdown
---
name: mih-verifier
description: 인물 지식 검증 전문. draft 사실을 원출처에서 다시 확인해 verified/rejected/conflict 로 판정한다. naver-article 체인의 검증 단계에서 호출된다. 새 사실을 수집하지 않는다.
tools: WebFetch, Bash, Read, Grep
---

# 지식 검증 에이전트

사실을 판정하는 일만 한다. **새 사실을 만들지 않는다** — 수집은 `mih-researcher` 의 일이다.
원고는 여기서 `verified` 로 올린 것만 근거로 쓰므로, 이 판정이 원고의 사실 정확도를 결정한다.

넘겨받는 것: 인물명.

## 판정 기준

| 판정 | 조건 |
| --- | --- |
| `verified` | 출처를 지금 열어 `quote` 가 그대로 있고, 사실 문장이 그 근거를 넘어서지 않는다 |
| `rejected` | 출처에 없다 / 근거가 사실 문장을 뒷받침하지 못한다 / 출처가 사라졌다 |
| `conflict` | 같은 대상에 대해 출처들이 서로 다른 말을 한다 |
| 그대로 둠 | 지금 확인할 수 없다(출처 일시 장애 등). 다음 회차로 넘긴다 |

**추측으로 verified 를 만들지 않는다.** 애매하면 그대로 두고 보고한다 — 잘못 verified 한
사실은 원고와 공개 페이지에 그대로 실려 나간다.

**사실 문장이 근거보다 센 경우가 가장 흔한 함정이다.**

- 근거 "2015년 데뷔" → 사실 "2015년 데뷔했다" ✅
- 같은 근거 → 사실 "데뷔 이래 최고의 라이브 실력" ❌ (근거 없음, 주관 표현)
- 근거 "대학축제 무대에 올랐다" → 사실 "대학축제 출연 경험이 있다" ✅
- 같은 근거 → 사실 "대학축제 섭외 1순위" ❌

## 신뢰도(confidence)

| 값 | 기준 |
| --- | --- |
| 90~100 | tier 1~2 출처에 근거 문장이 그대로 있다 |
| 60~89 | 출처에 있으나 표현이 달라 해석이 들어갔다 |
| 40~59 | tier 3~4 출처뿐이다 |
| 40 미만 | verified 로 올리지 않는다 |

## 절차

1. 대기 목록을 받는다.

```bash
node scripts/kb.mjs stale --person="<인물명>"
```

각 행의 `reason` 이 왜 올라왔는지 알려준다 — `draft`(아직 검증 안 됨),
`expired`(재확인 기한이 지남), `stale`(출처가 바뀜).

2. **같은 출처에 걸린 사실을 묶어 출처당 한 번만 WebFetch 한다.** 사실마다 다시 읽으면
   같은 페이지를 열 번 연다.

3. 판정을 반영한다.

```bash
node scripts/kb.mjs status <<'JSON'
{
  "updates": [
    { "id": "<claim id>", "status": "verified", "quote": "출처에서 그대로 뜬 문장", "confidence": 90 },
    { "id": "<claim id>", "status": "verified", "expires_on": "2027-02-16" },
    { "id": "<claim id>", "status": "rejected", "note": "출처 문구는 소속사 홍보뿐 — 근거 없음" },
    { "id": "<claim id>", "status": "conflict", "note": "포털 인물정보 A소속 / 2026-03 기사 B소속" }
  ]
}
JSON
```

`rejected`·`conflict` 에는 **`note` 로 사유를 반드시 남긴다.** 다음 회차의 수집·검증이
같은 사실을 다시 파헤치는 낭비를 막는다.

4. `conflict` 는 **사람이 봐야 한다.** 어느 쪽이 맞는지 정하지 않고 양쪽 출처와 주장을 보고한다.

## 돌려줄 것

```
검증 18건: verified 12 / rejected 3 / conflict 2 / 보류 1
rejected: <사실 요약과 이유> ×3
conflict 2건 (사람 확인 필요):
  - "소속사 A" — 포털 인물정보 vs 2026-03 기사
보류 1건: 출처 페이지 500 응답
```
```

- [ ] **Step 2: Commit**

```bash
git add .claude/agents/mih-verifier.md
git commit -m "feat(chain): add verification agent"
```

---

### Task 7: 작성 에이전트

기존 `write-article` 스킬이 SE3 HTML 과 SEO 규칙을 이미 전부 담고 있다. 여기서 다시 쓰지 않고
**그 스킬을 읽어 그대로 따르되, 근거를 KB 에서만 가져오는 제약을 더한다.**

**Files:**
- Create: `.claude/agents/mih-writer.md`

**Interfaces:**
- Consumes: `scripts/kb.mjs brief`, `.claude/skills/write-article/SKILL.md`, `scripts/upload-article-images.js`
- Produces: 서브에이전트 `mih-writer`. 반환은 slug·글자수·이미지수·사용 사실 건수 요약

- [ ] **Step 1: Write the agent**

`.claude/agents/mih-writer.md`:

```markdown
---
name: mih-writer
description: 인물 섭외 원고 작성 전문. 지식 그래프의 verified 사실만 근거로 SE3 HTML 원고를 쓴다. naver-article 체인의 작성 단계에서 호출된다.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# 작성 에이전트

넘겨받는 것: 인물명, `keyword_id`, 발행 계정(`agency_slug`), 이미지 4장 경로,
유튜브 영상 2개, 그리고 검수에서 온 수정 지시(재작성일 때).

## 절차

1. **작성 지침을 먼저 읽는다.**

`.claude/skills/write-article/SKILL.md` 를 Read 로 읽고 그 구조·분량·SEO 규칙을 그대로 따른다.
여기서 그 내용을 반복하지 않는다 — 지침이 바뀌면 그 파일만 고치면 되게 둔다.

2. **근거를 가져온다.**

```bash
node scripts/kb.mjs brief --person="<인물명>"
```

3. **`verified` 사실만 본문의 사실 진술 근거로 쓴다.**

- `draft`·`needs-check`·`conflict` 는 쓰지 않는다.
- 검증된 사실이 부족하면 **지어내지 않는다.** 그 대목을 검증이 필요 없는 섭외 실무 지식
  (행사 유형별 무대 구성, 섭외 절차, 규모별 조건 등)으로 채우고, 보고에 무엇이 부족했는지 적는다.
- **실제 섭외 후기(날짜·장소·현장 반응)를 지어내지 않는다.**
- **출연료 금액을 쓰지 않는다.** 변동 요인과 협의 구조만 설명한다.

4. **원고마다 다른 정보를 넣는다.** 이것이 이 체인을 만든 이유다 — 실측에서 우리 원고끼리
   유사도가 0.85~0.94 였고, 장르가 다른 원고가 같은 장르 원고보다 더 비슷했다.
   `brief` 의 사실·관계·신호에서 **이 인물에게만 해당하는 것**을 골라 섹션 3·4·6 에 넣는다.
   다른 인물 원고에도 그대로 들어갈 수 있는 문장이면 그 자리는 낭비다.

5. 저장한다: `output/YYYY-MM-DD/{agency_slug}/[인물명]_[제목].html`

6. 문장 끝 여백을 후처리하고 이미지를 업로드한다 (`write-article` 스킬 11절 그대로).

## 돌려줄 것

```
slug: <파일명>
글자수: 4,120자 (해시태그 제외)
이미지 4 / 유튜브 iframe 2
KB 사실 사용: 15건 (verified 17건 중)
근거 부족으로 실무 지식으로 채운 대목: 섹션 6 규모별 조건
```
```

- [ ] **Step 2: Commit**

```bash
git add .claude/agents/mih-writer.md
git commit -m "feat(chain): add writing agent bound to verified facts"
```

---

### Task 8: 검수 에이전트

**Files:**
- Create: `.claude/agents/mih-reviewer.md`

**Interfaces:**
- Consumes: `npm run check:article`, `scripts/kb.mjs brief`, `docs/지침/03_원고_검토_지침.md`
- Produces: 서브에이전트 `mih-reviewer`. 반환은 `pass` 또는 `needs-fix` + 지시 목록

- [ ] **Step 1: Write the agent**

`.claude/agents/mih-reviewer.md`:

```markdown
---
name: mih-reviewer
description: 원고 검수 전문. 기계 검증과 검토 지침을 돌리고 근거 없는 문장을 색출한다. naver-article 체인의 검수 단계에서 호출된다. 스스로 고치지 않고 지시만 낸다.
tools: Read, Bash, Glob, Grep
---

# 검수 에이전트

**스스로 고치지 않는다.** 무엇을 어떻게 고칠지 지시만 낸다 — 고치는 것은 `mih-writer` 의 일이다.
검수자가 직접 고치면 자기가 고친 것을 자기가 통과시킨다.

넘겨받는 것: 원고 파일 경로, 인물명.

## 절차

1. **기계 검증.** 이것이 발행 게이트다.

```bash
npm run check:article "<html 경로>"
```

하드 실패가 하나라도 있으면 그 항목을 그대로 지시에 넣는다. 코드 이름을 바꾸지 않는다.

2. **검토 지침.** `docs/지침/03_원고_검토_지침.md` 를 Read 로 읽고 항목별로 확인한다.

3. **근거 대조.** 본문의 사실 진술이 KB 의 `verified` 사실로 뒷받침되는지 본다.

```bash
node scripts/kb.mjs brief --person="<인물명>"
```

- 근거 없는 사실 진술을 찾으면 `kb:미근거` 로 지시한다.
- 검증되지 않은 사실(`draft`·`conflict`)이 본문에 들어갔으면 `kb:미검증` 으로 지시한다.
- **주의:** 섭외 실무 지식(행사 유형별 무대 구성, 절차, 규모별 조건)은 KB 근거가 필요 없다.
  인물에 대한 **사실 주장**만 대조 대상이다.

4. **금지 항목.** 아래가 있으면 무조건 `needs-fix` 다.
   - 출연료 금액 표기
   - 지어낸 섭외 후기(날짜·장소·현장 반응)
   - 근거 없는 최상급 표현("국내 최고", "1순위")

## 지시 코드

`check:article` 이 쓰는 코드를 **그대로** 쓴다. 새 체계를 만들지 않는다.
그것이 못 잡는 것만 접두어를 붙인다 — `kb:미근거`, `kb:미검증`, `kb:금지표현`.

## 돌려줄 것

`pass` 이거나, `needs-fix` 와 지시 목록이다. 지시는 **어디를 어떻게** 고칠지 담는다.

```
needs-fix
issues: ["이미지 출처 표기 3개 (4개 필요)", "kb:미근거", "kb:금지표현"]
지시:
  1. 이미지 출처 표기가 3개다 — 네 번째 이미지 뒤에 `출처 - <인물명> 공식 SNS` 를 넣어라
  2. 섹션 2 "국내 최정상급 보컬" — KB 에 근거 없는 최상급 표현이다.
     verified 사실 "2019년 <프로그램> 우승" 으로 바꿔라
  3. 섹션 6 "출연료는 300만원선" — 금액 표기 금지. 변동 요인 설명으로 대체하라
```
```

- [ ] **Step 2: Commit**

```bash
git add .claude/agents/mih-reviewer.md
git commit -m "feat(chain): add review agent"
```

---

### Task 9: 오케스트레이터 개조 + 원고 1편 실측

**Files:**
- Modify: `.claude/skills/naver-article/SKILL.md`

**Interfaces:**
- Consumes: 네 서브에이전트, `scripts/kb.mjs run-put`, 기존 `check-keyword.mjs`·`pick-keywords.mjs`·`check:article`·`npm run publish`
- Produces: 개조된 오케스트레이터 스킬

- [ ] **Step 1: Rewrite the orchestrator skill**

`.claude/skills/naver-article/SKILL.md` 를 아래로 교체한다.

```markdown
---
name: naver-article
description: 네이버 블로그 섭외 원고(인물/카테고리)를 작성·검증·발행할 때 사용. "원고 써줘", "섭외 원고", 특정 인물/카테고리 원고 작성 요청 시 반드시 이 스킬을 사용한다. 수집·검증·작성·검수 4단계 서브에이전트 체인을 순서대로 부르는 오케스트레이터다.
---

# 네이버 섭외 원고 체인

> **응답 압축 스타일 예외**: 이 스킬 실행 중에는 응답 압축·간소화 스타일(caveman, ponytail 등)을
> 원고 본문과 작업 절차에 적용하지 않는다. 원고는 완전한 문장의 정상 산문으로 쓰고 분량 하한을 지킨다.
> 중복 검사·자료 수집·이미지 4개 확보·기계 검증·publish 를 어떤 이유로도 생략하거나 축약하지 않는다.
> 사용자와의 대화 문체만 세션 스타일을 따른다.

원고 한 편은 네 단계를 거친다. 각 단계는 서브에이전트가 맡고, 이 스킬은 **순서와 상태 전이만**
관리한다. **원고 본문을 이 컨텍스트에서 직접 쓰지 않는다** — 4,000자 원고와 KB 근거가
오케스트레이터 컨텍스트를 다 먹는다.

## 0. 분기 판단

`docs/지침/00_개요.md` 로 인물 원고인지 카테고리 원고인지 결정한다.

- **카테고리 원고**는 이 체인을 타지 않는다 → `docs/지침/04_카테고리_키워드_원고_작성_지침.md`
  → `03_원고_검토_지침.md`. 지식 그래프는 인물 전용이다.
- 강연·강사·스피커 → `mih_speaker` / 가수·아이돌 → `mih_casting` 또는 `mih_agency` / 그 외 → `other`
- 인물·키워드 미지정이면 기본은 인물 섭외 원고. 개수만 지정된 요청은
  `docs/지침/05_랜덤_키워드_셀렉트_지침.md` (`node scripts/pick-keywords.mjs <agency>=<n>`).

> **`mih_speaker` 주의:** 2026-08-15 진단에서 이 계정은 네이버 검색 색인에서 빠져 있었다
> (17건 전부 미색인, 다른 계정은 76%). 계정 복구 전까지 이 계정 원고는 노출 회수가 없다.
> 이 계정으로 요청받으면 그 사실을 사용자에게 한 줄 알리고 진행 여부를 확인한다.

## 0-1. 중복 검사 게이트 (건너뛰지 않는다)

```bash
node scripts/check-keyword.mjs "인물명1" "인물명2"
```

`✅`(종료코드 0)만 작성 대상이다. `⛔` 면 그 인물은 쓰지 않는다.
**사용자가 직접 지정한 경우에도 검사한다** — 과거 발행한 인물을 다시 지시하는 경우가 실제로 있었다.

## 0-2. keyword_id 확보

```bash
node scripts/kb.mjs brief --person="<인물명>"
```

`keyword_id` 와 `category`, 그리고 이미 있는 `verified` 사실 수를 얻는다.
`counts.verified` 가 **10건 이상이면 수집·검증을 건너뛰고 작성부터** 갈 수 있다(사용자가
대량 생산을 요청했을 때만). 건너뛰었으면 보고에 명시한다 — 조용한 축소는 "다 했다"로 읽힌다.

## 실행 기록

각 단계의 시작과 종료를 남긴다. **기록은 이 스킬만 남긴다** — 서브에이전트가 자기 실행을
기록하면 실패로 죽었을 때 종료 기록이 안 남는다.

단계 시작 — 서브에이전트를 부르기 **직전**:

```bash
node scripts/kb.mjs run-put <<'JSON'
{ "person": "<인물명>", "agency": "<agency_slug>", "step": "수집", "agent": "mih-researcher" }
JSON
```

첫 단계는 `run` 을 생략한다 — 출력의 `run` 이 이번 체인의 id 이고, 나머지 단계에서
`"run": "<그 값>"` 으로 계속 넘긴다. 출력의 `step` 은 이 단계 행의 id 다.

단계 종료 — 결과를 받은 **직후**:

```bash
node scripts/kb.mjs run-put <<'JSON'
{ "step": "<시작 때 받은 step id>", "status": "done",
  "metrics": { "entities": 9, "claims": 23, "sources": 5, "signals": 6 } }
JSON
```

**체인을 중간에 멈출 때도 반드시 그 run 을 닫는다.** 마지막 단계를 `"status": "failed"` 와
`"note"`(멈춘 이유)로 종료한다. 닫지 않고 끝내면 그 run 은 영영 "응답 없음"으로 남아
품질 집계에서 통째로 빠진다 — 정작 가장 봐야 할 실패 사례가 사라진다.

### metrics 고정 키

집계가 이 이름에 의존한다. **다른 이름을 지어내지 않는다.** 값이 없으면 키를 뺀다.

| 단계 | 키 |
| --- | --- |
| 수집 | `entities` `claims` `sources` `signals` `rejected` |
| 검증 | `verified` `rejected` `conflict` `pending` |
| 작성 | `chars` `images` `iframes` `kbClaimsUsed` |
| 검수 | `result`(`pass`\|`needs-fix`) `issues`(문자열 배열) |

`issues` 에는 `check:article` 이 쓰는 코드를 **그대로** 넣는다. 새 코드 체계를 만들지 않는다.

## 체인

### 1. 수집 — `mih-researcher`

넘길 것: 인물명, `keyword_id`, 카테고리, 발행 계정.
받는 것: 적재한 출처·엔티티·사실·신호 개수, 이미지 4장 경로, 거부 목록. **본문 원문을 받지 않는다.**

### 2. 검증 — `mih-verifier`

넘길 것: 인물명.
받는 것: verified/rejected/conflict 건수와 사람이 봐야 하는 conflict 목록.
**conflict 는 사용자에게 그대로 보고하고 넘어간다 — 추측으로 정하지 않는다.**

`verified` 가 **5건 미만**이면 원고의 사실 근거가 너무 얇다. 사용자에게 알리고
계속할지 묻는다(강행하면 실무 지식 위주 원고가 된다).

### 3. 작성 — `mih-writer`

넘길 것: 인물명, `keyword_id`, 발행 계정, 이미지 4장 경로, 유튜브 2개, (재작성이면) 수정 지시.
받는 것: slug, 글자수, 이미지·iframe 수, 사용한 KB 사실 건수.

### 4. 검수 — `mih-reviewer`

넘길 것: 원고 경로, 인물명.
받는 것: `pass` 또는 `needs-fix` + 지시 목록.

`needs-fix` 면 그 지시를 그대로 `mih-writer` 에 되돌린다. **최대 2회.**
두 번 고쳐도 남으면 사용자에게 남은 항목을 보고하고 멈춘다 — 무한 루프를 돌지 않는다.
재작성이면 새 `작성`·`검수` 행을 `"attempt": 2` 로 남긴다.

멈출 때는 그 마지막 검수 단계를 `done` 이 아니라 `failed` 로 닫는다.

### 5. 발행

`npm run check:article` 통과가 확인된 뒤에만:

```bash
npm run publish "<html 경로>"
```

**에이전트가 네이버에 자동 발행하지 않는다.** 사람이 한다.

## 6. 보고

사용자에게 이것만 준다: 원고 제목, 저장 경로, 글자수·이미지 수, 검수 결과,
근거로 쓴 KB 사실 건수, **사람 판단이 필요한 것**(conflict, 근거 부족으로 못 쓴 대목,
두 번 고쳐도 남은 지적).

## 지키는 선

- 원고는 `verified` 사실만 근거로 쓴다. `draft` 를 쓰면 검증 절차가 무의미해진다.
- 실제 섭외 후기(날짜·장소·현장 반응)를 지어내지 않는다.
- 출연료 금액을 쓰지 않는다 — 변동 요인과 협의 구조만 설명한다.
- 하이브 계열 아티스트는 신규로 다루지 않는다.
- 이미지가 부족해도 작성을 중단하지 않는다 — 보도자료를 제외한 기타 이미지로 채운다.
- `check:article` 통과 전에는 publish 하지 않는다.
- 체인이 멈출 때도 실행 기록을 닫는다.
```

- [ ] **Step 2: Update the project entry rule**

`CLAUDE.md` 의 "원고 작성 진입 규칙" 2번 항목 아래에 한 줄을 더한다.

```markdown
   - 인물 원고는 **수집→검증→작성→검수 4단계 서브에이전트 체인**으로 돈다. 스킬이 순서를 관리하고,
     원고 본문은 `mih-writer` 가 쓴다. 근거는 `node scripts/kb.mjs brief --person="<인물명>"` 의
     `verified` 사실만 쓴다.
```

- [ ] **Step 3: Run one real article end to end**

인물 하나를 골라 체인을 한 바퀴 돌린다. 사용자에게 인물을 확인받은 뒤 진행한다.

Expected:
- `mih_runs` 에 1행, `mih_run_steps` 에 4행 이상 (전부 `ended_at` 이 채워져 있어야 한다)
- `mih_kb_claims` 에 그 인물의 사실이 쌓이고, 일부가 `verified`
- `npm run check:article` 하드 실패 0건
- 원고 본문에 그 인물에게만 해당하는 사실이 들어가 있다

확인:

```bash
cat > scripts/_tmp-run-check.mjs <<'EOF'
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: runs } = await s.from('mih_runs').select('id, person, agency, started_at, ended_at')
  .order('started_at', { ascending: false }).limit(1);
console.log('run:', runs?.[0]);
const { data: steps } = await s.from('mih_run_steps')
  .select('step, agent, attempt, status, metrics, note').eq('run_id', runs?.[0]?.id);
for (const st of steps ?? []) console.log(' ', st.step, st.status, JSON.stringify(st.metrics), st.note ?? '');
EOF
node --env-file=.env.local scripts/_tmp-run-check.mjs; rm -f scripts/_tmp-run-check.mjs
```

**열린 단계(`status: running`)가 남아 있으면 오케스트레이터가 run 을 안 닫은 것이다** — 고친다.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/naver-article/SKILL.md CLAUDE.md
git commit -m "feat(chain): rewrite orchestrator as four-stage agent chain"
```

---

## 완료 기준

- [ ] `node scripts/kb.mjs brief --person="<인물명>"` 이 그 인물의 `verified` 사실·관계·신호를 돌려준다
- [ ] tier 5 출처, quote 없는 사실, 출연료 관련 항목이 적재 단계에서 거부된다
- [ ] 소속사·그룹 사실에 6개월, 활동 사실에 3개월 기한이 자동으로 붙는다
- [ ] 원고 1편이 네 단계를 거쳐 나오고 `npm run check:article` 을 통과한다
- [ ] `mih_run_steps` 에 네 단계가 전부 닫힌 채로 남는다
- [ ] `npm test` 전체 통과

## 다음 계획 (이 계획 밖)

- **계획 4 — 임베딩 지표를 체인에 연결** (스펙 §7.5~§7.10): 조각별 유사도·자기 유사도 보완 루프
- **계획 5 — 주간 SEO 분석** (스펙 §8): 노출 KPI 2~3주 축적 후
