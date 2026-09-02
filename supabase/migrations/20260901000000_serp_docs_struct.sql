-- 본문 "구성" 카운트. 이미지·영상·표·소제목 개수를 담는다.
--
-- 왜 뒤늦게 붙이나: 코퍼스는 용량을 아끼려고 HTML 을 버리고 순수 텍스트만 저장했다.
-- 그 결과 순위 평가에 쓸 수 있는 문서 지표가 길이·키워드 횟수뿐이었고,
-- "원고 품질은 순위와 무관하다"는 결론이 **품질을 재보지 않은 채** 나왔다.
-- 이 칸이 그 공백을 메운다. 채우기: `node scripts/serp-corpus.mjs --struct`
ALTER TABLE mih_serp_docs ADD COLUMN IF NOT EXISTS struct jsonb;
