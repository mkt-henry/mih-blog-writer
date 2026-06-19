-- 크롤러로 추가되는 신규 키워드의 출처(예: artsro 상세 URL)를 별도 컬럼에 기록한다.
-- 기존 notes 에 섞여 있던 출처 링크를 분리하기 위함.
alter table keywords
  add column if not exists source text;
