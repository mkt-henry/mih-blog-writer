alter table keywords
  add column if not exists is_active boolean not null default true;

create index if not exists keywords_is_active_idx on keywords (is_active);
