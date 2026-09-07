-- Discord 발행 알림을 pg_cron → GitHub Actions(.github/workflows/daily-discord.yml)로 이전.
-- 2026-09-07 Supabase egress 한도 초과(402)로 엣지 함수 호출이 막혀 알림이 끊긴 것이 계기.
-- 복구 뒤 이중 발송을 막기 위해 pg_cron 잡을 내린다. 엣지 함수 자체는 대시보드 수동 발송용으로 남긴다.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mih-daily-discord') then
    perform cron.unschedule('mih-daily-discord');
  end if;
end$$;
