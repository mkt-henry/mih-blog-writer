-- Supabase 플랜 갱신 알림을 GitHub Actions schedule(.github/workflows/plan-reminder.yml)에서 pg_cron 으로 옮긴다.
-- (2026-10-10 Owner: GitHub 예약 실행은 쓰지 않고 Supabase Cron 으로)
--
-- 매년 10월 5·6일 09:30 KST(00:30 UTC) 에 AIStudio 알림과 Discord 발행현황 채널로 같은 문구를 보낸다.
-- 비밀값은 Vault 에만 둔다 — 마이그레이션에 넣지 않는다:
--   AIStudio 토큰: aistudio_notify_token (20261005000000_discord_to_aistudio_notify.sql, 이미 있음)
--   Discord 발행현황 채널 웹훅: discord_status_webhook_url
--     select vault.create_secret('<웹훅 주소>', 'discord_status_webhook_url', 'Discord 발행현황 채널 웹훅');
--     (없으면 Discord 만 건너뛴다)
--
-- 테스트: select mih_plan_reminder(true);  → AIStudio 에만 [테스트] 제목, 푸시 없음. Discord 로는 안 보낸다.

------------------------------------------------------------
-- 1) mih_aistudio_notify: User-Agent 를 붙인다 (나머지는 그대로)
------------------------------------------------------------
create or replace function mih_aistudio_notify(
  p_title      text,
  p_body       text    default null,
  p_level      text    default 'info',
  p_url        text    default null,
  p_dedupe_key text    default null,
  p_push       boolean default null
) returns bigint as $$
declare
  endpoint text;
  token    text;
  payload  jsonb;
begin
  select value into endpoint from app_settings where key = 'AISTUDIO_NOTIFY_URL';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'aistudio_notify_token';
  if endpoint is null or endpoint = '' or token is null or token = '' then
    return null;  -- 설정 전이면 조용히 통과
  end if;

  payload := jsonb_strip_nulls(jsonb_build_object(
    'title',          left(p_title, 200),
    'body',           left(p_body, 4000),
    'level',          coalesce(p_level, 'info'),
    'url',            p_url,
    'dedupe_key',     p_dedupe_key,
    'dedupe_minutes', case when p_dedupe_key is not null then 1440 end,
    'push',           p_push
  ));

  return net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || token,
      'User-Agent', 'mih-blog-writer-supabase/1.0'
    ),
    body := payload,
    timeout_milliseconds := 10000
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function mih_aistudio_notify(text, text, text, text, text, boolean) from public, anon, authenticated;

------------------------------------------------------------
-- 2) 플랜 갱신 알림 (예전 plan-reminder.yml 문구 그대로)
------------------------------------------------------------
create or replace function mih_plan_reminder(p_test boolean default false)
returns void as $$
declare
  title   text := '⏰ Supabase Pro 갱신 예정 (10월 7일) — 무료로 내릴지 지금 결정하세요';
  usage   text := 'https://supabase.com/dashboard/org/wabptptdtkmixdxtuwsz/usage';
  billing text := 'https://supabase.com/dashboard/org/wabptptdtkmixdxtuwsz/billing';
  lead    text := '9월 7일 사진 재압축으로 전송량이 58% 줄었습니다. 한 달 전송량(Egress)이 5GB 미만이면 무료 플랜으로 충분합니다.';
  tail    text := '애매하면 Claude 에게 "Supabase 플랜 봐줘" 라고 물어보세요.';
  webhook text;
begin
  -- AIStudio 알림
  begin
    if p_test then
      perform mih_aistudio_notify(
        '[테스트] ' || title,
        lead || E'\n\n1. 사용량 확인: ' || usage || E'\n2. 5GB 미만이면 플랜 변경: ' || billing || E'\n\n' || tail,
        'info', null, 'plan-reminder-test-' || extract(epoch from now())::bigint, false);
    else
      perform mih_aistudio_notify(
        title,
        lead || E'\n\n1. 사용량 확인: ' || usage || E'\n2. 5GB 미만이면 플랜 변경: ' || billing || E'\n\n' || tail,
        'warning', usage, 'plan-reminder-' || to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'), null);
    end if;
  exception when others then
    raise warning 'plan reminder AIStudio 실패: %', sqlerrm;
  end;

  if p_test then
    return;  -- 테스트는 Discord 로 보내지 않는다
  end if;

  -- Discord 발행현황 채널 (웹훅이 없으면 건너뛴다)
  begin
    select decrypted_secret into webhook from vault.decrypted_secrets where name = 'discord_status_webhook_url';
    if webhook is not null and webhook <> '' then
      perform net.http_post(
        url := webhook,
        headers := jsonb_build_object('Content-Type', 'application/json', 'User-Agent', 'mih-blog-writer-supabase/1.0'),
        body := jsonb_build_object('content',
          '⏰ **Supabase Pro 갱신 예정 (10월 7일)** — 무료로 내릴지 지금 결정하세요.' || E'\n\n'
          || lead || E'\n1) 사용량 확인: ' || usage || E'\n2) 5GB 미만이면 플랜 변경: ' || billing || E'\n\n' || tail),
        timeout_milliseconds := 10000
      );
    end if;
  exception when others then
    raise warning 'plan reminder Discord 실패: %', sqlerrm;
  end;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function mih_plan_reminder(boolean) from public, anon, authenticated;

------------------------------------------------------------
-- 3) 매년 10/5, 10/6 09:30 KST
------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mih-plan-reminder') then
    perform cron.unschedule('mih-plan-reminder');
  end if;
end$$;

select cron.schedule('mih-plan-reminder', '30 0 5,6 10 *', 'select mih_plan_reminder();');
