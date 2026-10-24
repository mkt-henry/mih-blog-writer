-- 매일 알림(발행 현황 + 검색 노출 확인)을 고정 12:00 KST 에서 "그날 마지막 예약 발행 10분 뒤"로 옮긴다.
-- (2026-10-24 Owner: "매일 마지막 발행 시간 10분 뒤 알림이 오게해줘")
--
-- 예약 시각은 계정·날짜마다 다르다(07:00~11:40, run.sh slots()). 발행 전에는 DB 어디에도 남지 않으므로
-- 예약 발행 스크립트(run.sh publish)가 예약에 성공한 시각을 mih_publish_slots 에 적는다(scripts/record-publish-slots.mjs).
-- 10분마다 도는 mih-daily-alerts 잡이 그날 마지막 시각 + 10분이 지났는지 보고, 지났으면 하루 한 번만 두 알림을 부른다.
-- 그날 적힌 시각이 없으면(예약이 없던 날, 기록 실패) 예전처럼 12:00 KST 에 보낸다.
-- 신규 원고 알림(insert 트리거), 플랜 갱신 알림(mih-plan-reminder), rss-sync 는 건드리지 않는다.

create table if not exists mih_publish_slots (
  publish_date date        not null,               -- 발행일(KST)
  agency       text        not null,               -- run.sh 의 feed 이름(mih_agency·mih_casting·mih_speaker·mih_other)
  slot_at      timestamptz not null,               -- 네이버 예약 발행 시각
  created_at   timestamptz not null default now(),
  primary key (publish_date, agency, slot_at)
);
alter table mih_publish_slots enable row level security;   -- service_role 만 쓴다(정책 없음)

create table if not exists mih_daily_alert_runs (
  run_date date        primary key,                -- 알림을 보낸 날(KST). 하루 한 번만 보내기 위한 표시
  due_at   timestamptz,
  sent_at  timestamptz not null default now()
);
alter table mih_daily_alert_runs enable row level security;

-- 그날 알림을 보낼 시각: 마지막 예약 시각 + 10분, 기록이 없으면 12:00 KST.
create or replace function mih_daily_alerts_due_at(d date) returns timestamptz
language sql stable set search_path = public as $$
  select coalesce(
    max(slot_at) + interval '10 minutes',
    (d + time '12:00') at time zone 'Asia/Seoul'
  )
  from mih_publish_slots
  where publish_date = d
$$;

create or replace function mih_daily_alerts_tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  d   date := (now() at time zone 'Asia/Seoul')::date;
  due timestamptz := mih_daily_alerts_due_at(d);
begin
  if now() < due then
    return 'wait ' || due;
  end if;
  insert into mih_daily_alert_runs (run_date, due_at) values (d, due) on conflict (run_date) do nothing;
  if not found then
    return 'already sent';
  end if;

  -- 발행 현황 (예전 mih-daily-notify 잡과 같은 호출)
  perform net.http_post(
    url := (select value from app_settings where key = 'EDGE_BASE_URL') || '/daily-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from app_settings where key = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  -- 전일 발행 키워드 검색 노출 확인 (예전 mih-serp-check 잡과 같은 호출)
  perform net.http_get(
    url := (select value from app_settings where key = 'SITE_BASE_URL') || '/api/cron/naver-search-screenshots',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select value from app_settings where key = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    timeout_milliseconds := 300000
  );
  return 'sent';
end
$$;
revoke all on function mih_daily_alerts_tick() from public, anon, authenticated;

-- 이 마이그레이션을 오늘 알림 시각 뒤에 적용하면 오늘 것은 예전 잡이 이미 보냈다 → 다시 보내지 않게 표시만 한다.
insert into mih_daily_alert_runs (run_date, due_at)
select (now() at time zone 'Asia/Seoul')::date, null
where now() >= mih_daily_alerts_due_at((now() at time zone 'Asia/Seoul')::date)
on conflict (run_date) do nothing;

select cron.unschedule(jobname) from cron.job where jobname in ('mih-daily-notify', 'mih-serp-check');
select cron.unschedule(jobname) from cron.job where jobname = 'mih-daily-alerts';
select cron.schedule('mih-daily-alerts', '*/10 * * * *', 'select mih_daily_alerts_tick()');
