-- 매일 알림 두 개를 09:30 KST 에서 12:00 KST 로 옮긴다. (2026-10-20 Owner: "mih 디코 알람을 12시에 오게 해줘")
--   mih-daily-notify : 발행 현황 (AIStudio + Discord 발행현황/검색노출 채널)
--   mih-serp-check   : 전일 발행 키워드 검색 노출 캡처 (Discord)
-- 예약 발행 시각이 07:00~11:40 KST 로 흩어져 있어(#36) 정오에 보내면 그날 아침 발행분이 다 잡힌다.
-- pg_cron 은 UTC 기준이다: 12:00 KST = 03:00 UTC.
-- 신규 원고 알림(insert 트리거)과 플랜 갱신 알림(mih-plan-reminder)은 건드리지 않는다.

select cron.alter_job(jobid, schedule := '0 3 * * *')
from cron.job
where jobname in ('mih-daily-notify', 'mih-serp-check');
