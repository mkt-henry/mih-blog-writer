-- 순위 학습·평가용 문서 코퍼스.
--
-- `mih_serp_checks.competitors` 는 순위와 URL 만 남긴다. 그것만으로는
-- "네이버가 왜 이 글을 위에 뒀는가"를 학습할 수도, 후보 모델을 평가할 수도 없다 —
-- 본문이 있어야 한다. 이 표가 그 본문이다.
--
-- 우리 원고(articles.html_content)와 경쟁 글을 같은 형태(순수 텍스트)로 모아
-- 하나의 랭킹 데이터셋으로 쓴다.

CREATE TABLE IF NOT EXISTS mih_serp_docs (
  url         text PRIMARY KEY,
  blog_id     text,
  log_no      text,
  title       text,
  -- 본문 컨테이너만 뽑은 순수 텍스트. HTML 원본은 저장하지 않는다(용량).
  -- 컨테이너를 못 찾으면 행을 만들지 않는다 — 사이트 UI 문구가 섞인 본문은
  -- 길이 기준선을 통째로 망가뜨린 전례가 있다.
  body        text,
  char_len    integer,
  is_ours     boolean NOT NULL DEFAULT false,
  status      smallint,            -- 200 | 404 | -1(unknown)
  note        text,                -- 'noPost' | 'bad-url' | 'unknown'
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mih_serp_docs_blog_idx ON mih_serp_docs (blog_id);
CREATE INDEX IF NOT EXISTS mih_serp_docs_ours_idx ON mih_serp_docs (is_ours) WHERE is_ours;
