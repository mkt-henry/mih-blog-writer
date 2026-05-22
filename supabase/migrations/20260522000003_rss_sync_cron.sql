-- rss-sync Edge Function을 10분마다 호출
-- net.http_post 패턴은 기존 discord-notify cron 잡과 동일

do $$
begin
  if exists (select 1 from cron.job where jobname = 'rss-sync') then
    perform cron.unschedule('rss-sync');
  end if;
end$$;

select cron.schedule(
  'rss-sync',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := (select value from app_settings where key = 'EDGE_BASE_URL') || '/rss-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select value from app_settings where key = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
