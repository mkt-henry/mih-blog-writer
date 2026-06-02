-- Add the fourth publishing account.
-- Internal agency key: other
-- Naver blog RSS slug: kyh620303

alter table articles drop constraint if exists articles_agency_check;
alter table articles add constraint articles_agency_check
  check (agency in ('mih_speaker','mih_casting','mih_agency','other'));

alter table unmatched_rss_items drop constraint if exists unmatched_rss_items_agency_check;
alter table unmatched_rss_items add constraint unmatched_rss_items_agency_check
  check (agency in ('mih_speaker','mih_casting','mih_agency','other'));

alter table user_agency_permissions drop constraint if exists user_agency_permissions_agency_check;
alter table user_agency_permissions add constraint user_agency_permissions_agency_check
  check (agency in ('mih_speaker','mih_casting','mih_agency','other'));

insert into user_agency_permissions (user_id, agency, role)
select u.id, 'other', 'editor'
from app_users u
on conflict (user_id, agency) do nothing;
