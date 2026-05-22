-- articles에 메타 + 발행 추적 컬럼 추가 (keywords 폐기 준비)
alter table articles add column if not exists instagram_url    text;
alter table articles add column if not exists category         text;
alter table articles add column if not exists notes            text default '';
alter table articles add column if not exists published_at     timestamptz;
alter table articles add column if not exists published_url    text;
alter table articles add column if not exists published_source text
  check (published_source is null or published_source in ('rss', 'manual'));

-- 자주 쓰는 정렬 인덱스 (스펙 3.3)
create index if not exists articles_published_at_idx
  on articles (published_at desc)
  where published_at is not null;

create index if not exists articles_pool_fifo_idx
  on articles (agency, created_at)
  where published_at is null;
