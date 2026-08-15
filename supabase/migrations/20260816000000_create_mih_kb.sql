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
  -- keywords.id 는 uuid 가 아니라 짧은 문자열 id(예: 'mq4wnt22kf8o') 다 — 타입을 맞춘다.
  keyword_id  text REFERENCES keywords(id) ON DELETE CASCADE,
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
