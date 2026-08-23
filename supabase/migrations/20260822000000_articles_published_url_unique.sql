-- RSS 유령 행 정리 + published_url 유일 제약.
--
-- 원인(2026-08-22 확인): rss-sync 엣지 함수가 "이미 발행 표기된 링크" 집합을
-- 페이지네이션 없이 읽고 있었다. PostgREST 는 한 번에 1,000행만 주므로 발행이
-- 1,000건을 넘긴 시점부터 최근 글이 집합에서 빠졌고, 매시간 도는 크론이 같은
-- 블로그 글을 "초안 없는 누적 등록"으로 다시 insert 했다.
--
-- 결과: 하루 8~12건의 본문 없는 유령 행. 발행 집계가 부풀고, 노출 KPI 크론이
-- 같은 글을 두 번씩 네이버에 검색했다.
--
-- 함수 쪽 페이지네이션은 고쳤지만, 같은 종류의 사고(1,000행 한도 누락)가
-- pick-keywords 에서도 났었다. 앱 코드에 의존하지 않고 DB 가 막게 둔다.

-- 1) 지우기 전에 통째로 남긴다. 판단이 틀렸을 때 되돌릴 수 있어야 한다.
CREATE TABLE IF NOT EXISTS articles_rss_ghost_backup_20260822 AS
SELECT * FROM articles WHERE false;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY published_url
           -- 본문이 있는 행을 남긴다. 둘 다 있으면 먼저 만들어진 쪽(사람이 쓴 원고).
           ORDER BY length(coalesce(html_content, '')) DESC, created_at ASC
         ) AS rn
  FROM articles
  WHERE published_url IS NOT NULL
)
INSERT INTO articles_rss_ghost_backup_20260822
SELECT a.* FROM articles a JOIN ranked r ON r.id = a.id WHERE r.rn > 1;

-- 2) 유령 행에 딸린 노출 체크는 같이 지운다(article_id 는 ON DELETE CASCADE).
DELETE FROM articles a
USING articles_rss_ghost_backup_20260822 b
WHERE a.id = b.id;

-- 3) 같은 블로그 글이 두 행이 되는 일 자체를 막는다.
CREATE UNIQUE INDEX IF NOT EXISTS articles_published_url_key
  ON articles (published_url) WHERE published_url IS NOT NULL;
