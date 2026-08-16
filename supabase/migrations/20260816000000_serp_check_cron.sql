-- 노출 확인(네이버 검색 → Discord) 스케줄을 Vercel 크론에서 pg_cron 으로 옮긴다.
-- 발행 현황 알림(mih-daily-discord)과 같은 곳에서 관리하려는 것이고,
-- 검색·스크린샷 로직 자체는 그대로 Next.js 라우트에 있다.
--
-- 09:30 KST = 00:30 UTC. 발행이 08:00 / 08:30 / 09:00 세 번에 끝난 직후이며,
-- 대상은 "어제 실제로 발행된" 원고다(예정일 기준이 아니다).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('mih-serp-check');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'mih-serp-check',
  '30 0 * * *',
  $job$
    SELECT net.http_get(
      url := (select value from app_settings where key = 'SITE_BASE_URL')
             || '/api/cron/naver-search-screenshots',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select value from app_settings where key = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      -- 라우트 상한(300초)에 맞춘다. pg_net 은 응답만 기다리므로 여기서 끊겨도 라우트는 계속 돈다.
      timeout_milliseconds := 300000
    )
  $job$
);
