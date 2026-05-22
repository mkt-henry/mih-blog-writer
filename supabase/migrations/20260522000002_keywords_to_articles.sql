-- keywords의 메타를 articles로 이관.
-- 매칭 정책: keywords.keyword == articles.person_name (인물 원고 다수가 이 매핑)
-- 그 외 매칭 안 되는 키워드 행은 keywords_legacy에 백업.

create table if not exists keywords_legacy as
  select * from keywords where false;

-- 1) person_name 매칭으로 articles에 instagram_url/category/notes/published_url 채우기
update articles a
set
  instagram_url = coalesce(a.instagram_url, k.instagram),
  category      = coalesce(a.category, k.category),
  notes         = case when a.notes is null or a.notes = '' then coalesce(k.notes, '') else a.notes end,
  published_url = coalesce(a.published_url, k.published_url)
from keywords k
where k.keyword = a.person_name
  and (
    a.instagram_url is null or
    a.category is null or
    (a.notes is null or a.notes = '') or
    a.published_url is null
  );

-- 2) 위에서 매칭된 keyword 키를 기록해두기
create temp table _matched_keywords as
  select distinct k.id
  from keywords k
  join articles a on a.person_name = k.keyword;

-- 3) 매칭되지 않은 keywords를 legacy로 복사 (수동 정리 후 Phase 3에서 drop)
insert into keywords_legacy
select * from keywords
where id not in (select id from _matched_keywords)
on conflict do nothing;

-- (안전을 위해 원본 keywords는 이 마이그레이션에서 건드리지 않는다)
