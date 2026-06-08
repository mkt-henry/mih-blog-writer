-- 키워드 전용 사용자 플래그 + 전역 UI 설정(app_config) 테이블

-- 1) app_users.keyword_only
alter table app_users
  add column if not exists keyword_only boolean not null default false;

-- 2) app_config: UI 설정 전용 key-value (secrets용 app_settings와 분리)
create table if not exists app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);

alter table app_config enable row level security;

drop policy if exists "service_role_only" on app_config;
create policy "service_role_only" on app_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3) 전역 컬럼셋 기본값 시드 (멱등)
insert into app_config (key, value)
values ('keyword_only_columns', '["keyword","search","category"]'::jsonb)
on conflict (key) do nothing;
