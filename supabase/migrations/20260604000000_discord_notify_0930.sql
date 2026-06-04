-- Discord 발행 알림 시각을 10:00 KST → 09:30 KST 로 변경.
-- KST 09:30 = UTC 00:30.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mih-daily-discord') then
    perform cron.unschedule('mih-daily-discord');
  end if;
end$$;

select cron.schedule(
  'mih-daily-discord',
  '30 0 * * *',
  $job$
    select net.http_post(
      url := (select value from app_settings where key = 'EDGE_BASE_URL') || '/discord-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select value from app_settings where key = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
