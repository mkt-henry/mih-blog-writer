-- 신규 agency(blog 계정) 'kyh620303' 추가
-- articles / user_agency_permissions 의 agency CHECK 제약에 kyh620303 허용값 추가.
-- (keywords.agency 는 CHECK 제약이 없어 변경 불필요)

------------------------------------------------------------
-- 기존 agency CHECK 제약을 이름에 의존하지 않고 동적으로 제거
-- (인라인 제약 자동 명명 규칙이 환경마다 다를 수 있어 방어적으로 처리)
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
      and pg_get_constraintdef(oid) ilike '%mih_speaker%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table articles
  add constraint articles_agency_check
  check (agency in ('mih_speaker','mih_casting','mih_agency','kyh620303'));

alter table user_agency_permissions
  add constraint user_agency_permissions_agency_check
  check (agency in ('mih_speaker','mih_casting','mih_agency','kyh620303'));

------------------------------------------------------------
-- 관리자 시드 사용자에게 신규 agency editor 권한 부여 (멱등)
------------------------------------------------------------
insert into user_agency_permissions (user_id, agency, role)
select u.id, 'kyh620303', 'editor'
from app_users u
where u.username = 'bpark0718'
on conflict (user_id, agency) do nothing;
