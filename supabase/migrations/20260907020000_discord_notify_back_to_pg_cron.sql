-- Discord 발행 알림을 GitHub Actions → pg_cron 으로 되돌린다.
--
-- 2026-09-07 오전에 Supabase egress 한도 초과(402)로 엣지 함수 호출이 막혀
-- GitHub Actions 로 임시 이전했었다(20260907000000). 같은 날 차단이 풀린 것을
-- 확인해(프로젝트 ACTIVE_HEALTHY, discord-notify 200) pg_cron 경로로 복구한다.
--
-- 이중 발송 방지: .github/workflows/daily-discord.yml 의 schedule 트리거는 제거하고
-- workflow_dispatch(수동 실행)만 남긴다. 다시 402 가 나면 그 워크플로를 손으로 돌리면 된다.
--
-- 정의는 20260604000000_discord_notify_0930.sql 과 동일하다(09:30 KST = 00:30 UTC).

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
