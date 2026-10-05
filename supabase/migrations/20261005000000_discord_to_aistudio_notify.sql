-- Discord 알림을 AIStudio 알림(Owner 휴대폰 푸시 + 알림함)으로 옮긴다. (2026-10-05 Owner 결정: Discord 를 더 쓰지 않는다)
--
-- 1) mih_aistudio_notify(): DB 에서 AIStudio 로 알림을 보내는 공용 함수(pg_net, 비동기라 INSERT 를 막지 않는다).
--    토큰은 Vault 의 'aistudio_notify_token'(AIStudio 토큰 label mih-supabase)에 둔다 — 마이그레이션에 넣지 않는다:
--      select vault.create_secret('<토큰>', 'aistudio_notify_token', 'AIStudio 알림 토큰 (mih-supabase)');
--    주소는 app_settings.AISTUDIO_NOTIFY_URL.
-- 2) notify_new_article 트리거: 신규 원고 알림을 AIStudio 로. 원고는 반복 작업(13~0시 매시)이 한 편씩 올리고
--    그 카드가 결과를 따로 보고하므로 푸시는 하지 않고 알림함에만 남긴다(push:false).
-- 3) pg_cron mih-daily-discord → mih-daily-notify: 엣지 함수 discord-notify 를 daily-notify 로 바꾼다.
-- 4) Discord 웹훅 설정값(DISCORD_NEW_ARTICLE_WEBHOOK_URL)을 지운다.

insert into app_settings (key, value, description)
values (
  'AISTUDIO_NOTIFY_URL',
  'https://aistudio.bp-studio.com/api/hooks/notify',
  'AIStudio 알림 주소 (Discord 대신, 토큰은 Vault aistudio_notify_token)'
)
on conflict (key) do update set value = excluded.value, updated_at = now();

------------------------------------------------------------
-- 1) 공용 함수
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
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    body := payload,
    timeout_milliseconds := 10000
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

-- PostgREST 로 아무나 부르지 못하게 한다(트리거·cron 은 소유자 권한으로 돈다).
revoke all on function mih_aistudio_notify(text, text, text, text, text, boolean) from public, anon, authenticated;

------------------------------------------------------------
-- 2) 신규 원고 트리거 함수 (트리거 정의 articles_notify_new 는 그대로: 새 행만, rss-sync 누적분 제외)
------------------------------------------------------------
create or replace function notify_new_article()
returns trigger as $$
declare
  site_url text;
  label    text;
  link     text;
begin
  select value into site_url from app_settings where key = 'SITE_BASE_URL';

  label := case new.agency
             when 'mih_speaker' then 'influence'
             when 'mih_casting' then '캐스팅'
             when 'mih_agency'  then '에이전시'
             else new.agency
           end;

  link := case
            when site_url is not null and site_url <> ''
            then rtrim(site_url, '/') || '/article/' || new.id
            else null
          end;

  perform mih_aistudio_notify(
    '🆕 신규 원고 등록 · ' || label,
    '**' || coalesce(new.title, '') || '**' || E'\n'
      || '- 계정: ' || coalesce(label, '') || E'\n'
      || '- 인물/키워드: ' || coalesce(new.person_name, '') || E'\n'
      || '- 발행일: ' || coalesce(new.publish_date::text, ''),
    'info',
    link,
    'mih-article-' || new.id,
    false
  );

  return new;
end;
$$ language plpgsql security definer;

------------------------------------------------------------
-- 3) 매일 09:30 KST 발행 현황
------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mih-daily-discord') then
    perform cron.unschedule('mih-daily-discord');
  end if;
  if exists (select 1 from cron.job where jobname = 'mih-daily-notify') then
    perform cron.unschedule('mih-daily-notify');
  end if;
end$$;

select cron.schedule(
  'mih-daily-notify',
  '30 0 * * *',
  $job$
    select net.http_post(
      url := (select value from app_settings where key = 'EDGE_BASE_URL') || '/daily-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select value from app_settings where key = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

------------------------------------------------------------
-- 4) Discord 웹훅 설정 정리
------------------------------------------------------------
delete from app_settings where key = 'DISCORD_NEW_ARTICLE_WEBHOOK_URL';
