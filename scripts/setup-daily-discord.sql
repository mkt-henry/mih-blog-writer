-- 매일 10:00 KST에 Supabase Edge Function(discord-notify)을 호출해
-- Discord로 발행 현황을 알려주는 pg_cron 잡 설정.
--
-- 적용: Supabase SQL Editor에 이 파일을 통째로 붙여 실행하거나
--       npx supabase db push (마이그레이션으로 둘 때) 로 적용한다.

-- 1) 이전 구현 정리 — published_posts 테이블을 직접 조회하던 함수와 잡 제거
DO $$
BEGIN
  PERFORM cron.unschedule('mih-daily-discord');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP FUNCTION IF EXISTS send_daily_discord_report();

-- 2) 필요한 확장 보장
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3) 매일 01:00 UTC (10:00 KST)에 Edge Function 호출
--    Edge Function은 --no-verify-jwt 로 배포되어 별도 인증 헤더 없이 호출 가능.
SELECT cron.schedule(
  'mih-daily-discord',
  '0 1 * * *',
  $$SELECT net.http_post(
      url     := 'https://djtmniygzdbavxwrppxb.supabase.co/functions/v1/discord-notify',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := '{}'::jsonb
  )$$
);
