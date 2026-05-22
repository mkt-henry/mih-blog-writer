-- rss-sync cron 주기를 10분 간격 → 매일 1회로 변경.
-- 운영 패턴: 매일 10:00 KST 이전에 발행이 끝남. discord-notify가 10:00 KST에 발행 현황을
-- Discord로 보내므로, rss-sync는 그 직전(09:55 KST)에 돌아 DB를 최신 상태로 갱신.
--
-- KST 09:55 = UTC 00:55 → cron 표현 '55 0 * * *'

do $$
begin
  if exists (select 1 from cron.job where jobname = 'rss-sync') then
    perform cron.unschedule('rss-sync');
  end if;
end$$;

select cron.schedule(
  'rss-sync',
  '55 0 * * *',
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
