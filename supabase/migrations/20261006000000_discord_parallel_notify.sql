-- 신규 원고 알림을 AIStudio 와 Discord 로 같이 보낸다. (2026-10-06 Owner: "당분간은 mih 는 디코로도 알림이 왔으면 좋겠어")
--
-- 20261005000000_discord_to_aistudio_notify.sql 에서 Discord 를 뺐던 것을 병행으로 되살린다. 지우지 말 것.
-- AIStudio 알림(mih_aistudio_notify, 알림함에만)은 그대로 두고, Discord "신규 원고 알림" 채널에
-- 예전(20260907010000_rename_speaker_label_to_influence.sql)과 같은 임베드를 따로 보낸다.
--
-- 웹훅 주소는 저장소에 두지 않는다(공개 저장소). app_settings 에 운영 DB 에서만 넣는다:
--   insert into app_settings (key, value, description)
--   values ('DISCORD_NEW_ARTICLE_WEBHOOK_URL', '<웹훅 주소>', 'Discord 신규 원고 알림 채널 웹훅 (AIStudio 와 병행)')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
-- 끌 때: delete from app_settings where key = 'DISCORD_NEW_ARTICLE_WEBHOOK_URL';  (AIStudio 알림은 그대로 간다)
--
-- 두 발송은 각각 begin/exception 으로 감싸 한쪽이 실패해도 다른 쪽과 INSERT 를 막지 않는다
-- (pg_net 은 비동기라 원래도 응답을 기다리지 않는다).

------------------------------------------------------------
-- 1) Discord 신규 원고 임베드 (예전 notify_new_article 의 본문 그대로)
------------------------------------------------------------
create or replace function mih_discord_new_article(a articles)
returns bigint as $$
declare
  webhook  text;
  site_url text;
  label    text;
  color    int;
  link     text;
  payload  jsonb;
begin
  select value into webhook  from app_settings where key = 'DISCORD_NEW_ARTICLE_WEBHOOK_URL';
  select value into site_url from app_settings where key = 'SITE_BASE_URL';
  if webhook is null or webhook = '' then
    return null;  -- 웹훅 미설정 = Discord 꺼짐, 조용히 통과
  end if;

  label := case a.agency
             when 'mih_speaker' then 'influence'
             when 'mih_casting' then '캐스팅'
             when 'mih_agency'  then '에이전시'
             else a.agency
           end;
  color := case a.agency
             when 'mih_speaker' then 1402048   -- 0x1565C0
             when 'mih_casting' then 8067874   -- 0x7B1FA2
             when 'mih_agency'  then 3046962   -- 0x2E7D32
             else 15098112                     -- 0xE65100
           end;

  link := case
            when site_url is not null and site_url <> ''
            then rtrim(site_url, '/') || '/article/' || a.id
            else null
          end;

  payload := jsonb_build_object(
    'embeds', jsonb_build_array(
      (jsonb_build_object(
        'title', '🆕 신규 원고 등록',
        'color', color,
        'fields', (
          jsonb_build_array(
            jsonb_build_object('name', '제목', 'value', left(coalesce(a.title, '-'), 1024), 'inline', false),
            jsonb_build_object('name', '계정', 'value', coalesce(label, '-'), 'inline', true),
            jsonb_build_object('name', '인물/키워드', 'value', coalesce(nullif(a.person_name, ''), '-'), 'inline', true),
            jsonb_build_object('name', '발행일', 'value', coalesce(a.publish_date::text, '-'), 'inline', true)
          )
          || case when link is not null
                  then jsonb_build_array(jsonb_build_object('name', '🔗 원고 바로보기', 'value', link, 'inline', false))
                  else '[]'::jsonb
             end
        ),
        'footer', jsonb_build_object('text', 'MIH Blog Writer · 신규 원고 알림'),
        'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
      || case when link is not null then jsonb_build_object('url', link) else '{}'::jsonb end)
    )
  );

  return net.http_post(
    url := webhook,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := payload,
    timeout_milliseconds := 10000
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

-- PostgREST 로 아무나 부르지 못하게 한다(트리거는 소유자 권한으로 돈다).
revoke all on function mih_discord_new_article(articles) from public, anon, authenticated;

------------------------------------------------------------
-- 2) 신규 원고 트리거 함수: AIStudio + Discord (트리거 정의 articles_notify_new 는 그대로)
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

  -- AIStudio 알림 (알림함에만)
  begin
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
  exception when others then
    raise warning 'mih_aistudio_notify 실패: %', sqlerrm;
  end;

  -- Discord 신규 원고 알림 채널 (웹훅이 없으면 건너뛴다)
  begin
    perform mih_discord_new_article(new);
  exception when others then
    raise warning 'mih_discord_new_article 실패: %', sqlerrm;
  end;

  return new;
end;
$$ language plpgsql security definer;
