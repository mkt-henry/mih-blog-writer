-- 앱 비밀값 중앙 관리 테이블
-- 새 컴퓨터에서 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 두 개만 설정하면
-- 나머지 API 키(APIFY_TOKEN, BLOB_READ_WRITE_TOKEN 등)를 이 테이블에서 가져온다.

create table if not exists app_settings (
  key         text primary key,
  value       text not null,
  description text,
  updated_at  timestamptz default now()
);

-- service_role 만 읽기·쓰기 가능 (anon / authenticated 차단)
alter table app_settings enable row level security;

create policy "service_role_only"
  on app_settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
