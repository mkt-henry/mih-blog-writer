-- 사이트 앱(PWA) 알림: Discord 로 나가는 알림을 같은 형식 그대로 사이트에 쌓고, 앱을 설치한 기기에 푸시한다.
-- (2026-10-17 Owner: "mih 사이트 pwa로 만들어주고 디코 알림오는 형식을 그대로 보내줘. 그걸 복사하는 기능도 만들어주고")
--
-- mih_alerts: 보낸 알림 한 건 = Discord 웹훅 본문(payload: content / embeds) + 사진 주소(images).
--   사이트 /alerts 가 Discord 처럼 그려 보여 주고 복사 버튼을 단다.
--   넣는 쪽: 신규 원고 트리거(아래), daily-notify 엣지 함수, 예약 발행 캡처(send-aistudio.mjs),
--   검색 노출 캡처(/api/cron/naver-search-screenshots). Discord 웹훅이 꺼져 있어도 여기에는 쌓는다.
-- mih_push_subscriptions: 사이트에서 "알림 켜기"를 누른 기기(브라우저 푸시 구독). 웹이 service_role 로 쓴다.
-- 한 줄이 들어오면 트리거가 엣지 함수 send-push 를 불러 구독한 기기 전부에 보낸다(pg_net 비동기라 INSERT 를 막지 않는다).
--
-- Discord 발송(mih_discord_new_article 등)은 그대로 둔다. 지우지 말 것(2026-10-06 Owner: 디코로도 받는다).

create table if not exists public.mih_alerts (
  id         bigint generated always as identity primary key,
  channel    text not null,                     -- new-article / status / search / schedule / serp-shot
  payload    jsonb not null,                    -- Discord 웹훅 본문 그대로 { content?, embeds? }
  images     jsonb not null default '[]'::jsonb, -- [{ url, name }]
  created_at timestamptz not null default now()
);
create index if not exists mih_alerts_created_at_idx on public.mih_alerts (created_at desc);

create table if not exists public.mih_push_subscriptions (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  user_id    text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.mih_alerts enable row level security;
alter table public.mih_push_subscriptions enable row level security;
revoke all on public.mih_alerts, public.mih_push_subscriptions from anon, authenticated;

------------------------------------------------------------
-- 1) 넣으면 푸시: send-push 엣지 함수 호출
------------------------------------------------------------
create or replace function mih_alert_dispatch_push()
returns trigger as $$
declare
  edge_base text;
  svc_key   text;
begin
  select value into edge_base from app_settings where key = 'EDGE_BASE_URL';
  select value into svc_key   from app_settings where key = 'SUPABASE_SERVICE_ROLE_KEY';
  if edge_base is null or edge_base = '' or svc_key is null or svc_key = '' then
    return new;  -- 설정 전이면 쌓기만 한다
  end if;

  perform net.http_post(
    url := rtrim(edge_base, '/') || '/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
    body := jsonb_build_object('id', new.id, 'channel', new.channel, 'payload', new.payload, 'images', new.images),
    timeout_milliseconds := 30000
  );
  return new;
exception when others then
  raise warning 'mih_alert_dispatch_push 실패: %', sqlerrm;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function mih_alert_dispatch_push() from public, anon, authenticated;

drop trigger if exists mih_alerts_push on public.mih_alerts;
create trigger mih_alerts_push
after insert on public.mih_alerts
for each row execute function mih_alert_dispatch_push();

------------------------------------------------------------
-- 2) 신규 원고 Discord 임베드를 함수로 떼어 Discord 와 사이트 알림이 같은 본문을 쓴다
--    (본문은 20261006000000_discord_parallel_notify.sql 의 mih_discord_new_article 그대로)
------------------------------------------------------------
create or replace function mih_new_article_payload(a articles)
returns jsonb as $$
declare
  site_url text;
  label    text;
  color    int;
  link     text;
begin
  select value into site_url from app_settings where key = 'SITE_BASE_URL';

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

  return jsonb_build_object(
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
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function mih_new_article_payload(articles) from public, anon, authenticated;

create or replace function mih_discord_new_article(a articles)
returns bigint as $$
declare
  webhook text;
begin
  select value into webhook from app_settings where key = 'DISCORD_NEW_ARTICLE_WEBHOOK_URL';
  if webhook is null or webhook = '' then
    return null;  -- 웹훅 미설정 = Discord 꺼짐, 조용히 통과
  end if;

  return net.http_post(
    url := webhook,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := mih_new_article_payload(a),
    timeout_milliseconds := 10000
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function mih_discord_new_article(articles) from public, anon, authenticated;

------------------------------------------------------------
-- 3) 신규 원고 트리거 함수: AIStudio + Discord + 사이트 알림 (트리거 정의 articles_notify_new 는 그대로)
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

  -- 사이트 앱 알림 (Discord 와 같은 본문, 웹훅과 무관하게 쌓고 푸시)
  begin
    insert into mih_alerts (channel, payload) values ('new-article', mih_new_article_payload(new));
  exception when others then
    raise warning 'mih_alerts 신규 원고 실패: %', sqlerrm;
  end;

  return new;
end;
$$ language plpgsql security definer;
