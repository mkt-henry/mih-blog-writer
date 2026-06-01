-- agency 식별자 'kyh620303' → 'other' 이름 변경
-- 실제 네이버 블로그 계정 ID(kyh620303)는 코드의 blogSlug에서 그대로 유지하고,
-- DB의 agency 값과 source_path 디렉토리명만 'other'로 변경한다.

------------------------------------------------------------
-- 1) kyh620303 을 허용하던 기존 CHECK 제약 제거 (이름에 의존하지 않고 동적 처리)
------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('articles'::regclass, 'user_agency_permissions'::regclass)
      and pg_get_constraintdef(oid) ilike '%kyh620303%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

------------------------------------------------------------
-- 2) 데이터 이름 변경
------------------------------------------------------------
update articles
  set agency = 'other',
      source_path = replace(source_path, '/kyh620303/', '/other/')
  where agency = 'kyh620303';

update user_agency_permissions
  set agency = 'other'
  where agency = 'kyh620303';

------------------------------------------------------------
-- 3) CHECK 제약 재생성 ('other' 허용)
------------------------------------------------------------
alter table articles
  add constraint articles_agency_check
  check (agency in ('mih_speaker','mih_casting','mih_agency','other'));

alter table user_agency_permissions
  add constraint user_agency_permissions_agency_check
  check (agency in ('mih_speaker','mih_casting','mih_agency','other'));
