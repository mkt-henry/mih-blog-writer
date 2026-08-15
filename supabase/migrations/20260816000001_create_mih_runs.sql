-- 체인 실행 기록. 어느 인물이 지금 어느 단계인지, 검증에서 몇 건이 걸렸는지 밖에서 본다.
--
-- 기록은 오케스트레이터만 남긴다 — 서브에이전트가 자기 실행을 기록하면
-- 실패로 죽었을 때 종료 기록이 안 남아 "응답 없음"으로 영영 남는다.
--
-- keywords.id 는 uuid 가 아니라 짧은 문자열 id 다.

CREATE TABLE IF NOT EXISTS mih_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id text REFERENCES keywords(id) ON DELETE SET NULL,
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
