-- 매일 알림을 보낸 뒤 같은 날 더 늦은 예약이 생기면(예약 작업을 늦게 다시 돌린 날) 그 마지막 시각 + 10분에 한 번 더 보낸다.
-- 2026-10-24: 12:00 에 알림이 나간 뒤 한도로 멈췄던 예약 작업이 오후에 다시 돌아 15:40~18:50 발행분이 생겼는데,
-- "오늘은 이미 보냄" 표시 때문에 마지막 발행 뒤 알림이 다시 나가지 않았다.
-- 보낸 시각(sent_at)이 지금 계산한 알림 시각(due)보다 이르면 다시 보낸다. 같은 due 로는 한 번만 나간다.

create or replace function mih_daily_alerts_tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  d   date := (now() at time zone 'Asia/Seoul')::date;
  due timestamptz := mih_daily_alerts_due_at(d);
begin
  if now() < due then
    return 'wait ' || due;
  end if;
  insert into mih_daily_alert_runs (run_date, due_at) values (d, due)
  on conflict (run_date) do update set due_at = excluded.due_at, sent_at = now()
    where mih_daily_alert_runs.sent_at < excluded.due_at;
  if not found then
    return 'already sent';
  end if;

  -- 발행 현황
  perform net.http_post(
    url := (select value from app_settings where key = 'EDGE_BASE_URL') || '/daily-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from app_settings where key = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  -- 전일 발행 키워드 검색 노출 확인
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
