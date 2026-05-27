-- 사용자별 agency 권한 매트릭스
-- row 존재 = 해당 agency에 대해 view 또는 editor 권한
-- row 없음 = 권한 없음 (UI에서 컬럼 자체 미노출)

create table if not exists user_agency_permissions (
  user_id    uuid not null references app_users(id) on delete cascade,
  agency     text not null check (agency in ('mih_speaker','mih_casting','mih_agency')),
  role       text not null check (role in ('view','editor')),
  granted_at timestamptz default now(),
  primary key (user_id, agency)
);

create index if not exists user_agency_permissions_user_idx
  on user_agency_permissions (user_id);

alter table user_agency_permissions enable row level security;

create policy "service_role_only" on user_agency_permissions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 기존 시드 사용자에게 3개 agency editor 권한 부여 (멱등)
insert into user_agency_permissions (user_id, agency, role)
select u.id, a.agency, 'editor'
from app_users u
cross join (values ('mih_speaker'),('mih_casting'),('mih_agency')) as a(agency)
where u.username = 'bpark0718'
on conflict (user_id, agency) do nothing;
