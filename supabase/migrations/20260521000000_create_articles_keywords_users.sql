-- 원고/키워드/사용자 테이블 생성
-- 정적 사이트 → Next.js + Supabase 비공개 동적 사이트 마이그레이션의 핵심 스키마

------------------------------------------------------------
-- articles: 원고 1편 = 1 row
------------------------------------------------------------
create table if not exists articles (
  id            uuid primary key default gen_random_uuid(),
  publish_date  date not null,
  agency        text not null check (agency in ('mih_speaker','mih_casting','mih_agency')),
  slug          text not null,
  person_name   text not null,
  title         text not null,
  html_content  text not null,
  source_path   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (publish_date, agency, slug)
);

create index if not exists articles_date_idx   on articles (publish_date desc);
create index if not exists articles_agency_idx on articles (agency);
create index if not exists articles_slug_idx   on articles (slug);

------------------------------------------------------------
-- keywords: 기존 output/keywords.json 1:1 매핑
------------------------------------------------------------
create table if not exists keywords (
  id             text primary key,
  keyword        text not null,
  category       text not null,
  notes          text default '',
  instagram      text,
  agency         text,
  published_url  text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists keywords_category_idx on keywords (category);

------------------------------------------------------------
-- app_users: 평문 ID/PW (사용자 명시로 해싱 없음, 내부 도구용)
------------------------------------------------------------
create table if not exists app_users (
  id          uuid primary key default gen_random_uuid(),
  username    text unique not null,
  password    text not null,
  created_at  timestamptz default now()
);

------------------------------------------------------------
-- app_sessions: 쿠키 토큰 ↔ 사용자 매핑
------------------------------------------------------------
create table if not exists app_sessions (
  token       text primary key,
  user_id     uuid not null references app_users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);

create index if not exists app_sessions_user_idx    on app_sessions (user_id);
create index if not exists app_sessions_expires_idx on app_sessions (expires_at);

------------------------------------------------------------
-- RLS: anon/authenticated 전면 차단, service_role만 통과
-- (Next.js 서버에서 service_role 키로만 접근)
------------------------------------------------------------
alter table articles     enable row level security;
alter table keywords     enable row level security;
alter table app_users    enable row level security;
alter table app_sessions enable row level security;

create policy "service_role_only" on articles     for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_only" on keywords     for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_only" on app_users    for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_only" on app_sessions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

------------------------------------------------------------
-- updated_at 자동 갱신 트리거
------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists articles_touch_updated_at on articles;
create trigger articles_touch_updated_at
  before update on articles
  for each row execute function touch_updated_at();

drop trigger if exists keywords_touch_updated_at on keywords;
create trigger keywords_touch_updated_at
  before update on keywords
  for each row execute function touch_updated_at();

------------------------------------------------------------
-- 초기 사용자 시드 (멱등: username unique)
------------------------------------------------------------
insert into app_users (username, password)
values ('bpark0718', 'Bp07181995!')
on conflict (username) do nothing;
