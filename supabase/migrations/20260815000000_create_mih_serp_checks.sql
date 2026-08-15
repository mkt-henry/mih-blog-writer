-- "<인물명> 섭외" 검색의 색인 여부·순위 기록.
--
-- indexed 와 rank 를 분리하는 이유: 색인 실패(계정 지수·발행 패턴 문제)와
-- 색인은 됐으나 밀린 것(원고 문제)은 원인이 다르다. 한 덩어리로 묶으면 진단이 불가능하다.
--
-- 미노출도 1행을 남긴다. 기존 스크린샷 크론은 미노출을 조용히 skip 해서
-- 정작 가장 봐야 할 실패 사례가 기록되지 않았다.

CREATE TABLE IF NOT EXISTS mih_serp_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid REFERENCES articles(id) ON DELETE CASCADE,
  query       text NOT NULL,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  -- 중복 방지 키. checked_at::date 를 쓰는 표현식 인덱스로 만들면 PostgREST 의
  -- on_conflict 가 그것을 가리킬 수 없고(컬럼 이름만 받는다), 생성 컬럼으로 만들면
  -- timestamptz→date 캐스트가 immutable 이 아니라 거부된다. 그래서 기본값을 가진
  -- 평범한 date 컬럼으로 둔다.
  checked_on  date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),
  surface     text NOT NULL DEFAULT 'pc-total',
  indexed     boolean NOT NULL,
  rank        smallint,
  competitors jsonb NOT NULL DEFAULT '[]',
  screenshot  text,
  note        text
);

CREATE INDEX IF NOT EXISTS mih_serp_checks_article_idx
  ON mih_serp_checks (article_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS mih_serp_checks_query_idx
  ON mih_serp_checks (query, checked_at DESC);

-- 같은 원고를 같은 날 두 번 기록하지 않는다(크론 재실행·수동 실행 중복 방지).
CREATE UNIQUE INDEX IF NOT EXISTS mih_serp_checks_daily_idx
  ON mih_serp_checks (article_id, surface, checked_on);
