-- rss-sync cron 주기를 '매일 1회(09:55 KST)' → '매시간' 으로 변경.
--
-- 배경: 2026-06-27 발행분이 당일 DB에 반영되지 않은 사건.
--   원인은 cron 실패가 아니라 스케줄-발행 시각 불일치였다.
--   - rss-sync 는 09:55 KST(UTC 00:55)에 1회만 실행 (succeeded).
--   - 그런데 그날 네이버 발행은 14:08~14:45 KST 에 이뤄졌다.
--   → sync 시점 RSS 에 당일 글이 없어 매칭 0건 → DB 미반영.
--     (다음날 sync 가 메꿔주긴 하지만 '당일 발행 현황'이 비어 보임)
--
-- 해결: 발행이 몇 시에 되든 한 시간 내 DB 에 반영되도록 매시간 실행.
--   rss-sync 는 RSS 4개 fetch + 미발행행 매칭뿐이라 매시간이어도 부하가 작고,
--   이미 published_url 이 채워진 글은 건너뛰므로 멱등적이다.
--   (과거 10분 간격에서 daily 로 줄였던 20260522000004 의 트레이드오프를 되돌림)
--
-- cron 표현 '0 * * * *' = 매시간 정각(UTC). DB·RSS 모두 UTC 기준이라 KST 환산 불필요.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'rss-sync') then
    perform cron.unschedule('rss-sync');
  end if;
end$$;

select cron.schedule(
  'rss-sync',
  '0 * * * *',
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
