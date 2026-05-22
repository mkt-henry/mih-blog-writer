-- RSS에 떴는데 articles와 매칭 안 된 항목들. 60일 보관.
create table if not exists unmatched_rss_items (
  agency        text    not null check (agency in ('mih_speaker','mih_casting','mih_agency')),
  link          text    not null,
  title         text    not null,
  pub_ts        bigint  not null,
  first_seen_at timestamptz default now(),
  last_seen_at  timestamptz default now(),
  primary key (agency, link)
);

create index if not exists unmatched_rss_items_pub_idx
  on unmatched_rss_items (pub_ts desc);

alter table unmatched_rss_items enable row level security;

create policy "service_role_only" on unmatched_rss_items
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
