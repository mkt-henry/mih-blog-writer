-- 신규 원고 Discord 알림에 '원고 바로보기' 링크 추가.
-- 배포 사이트의 단건 원고 페이지 경로는 /article/{id} (로그인 필요).
-- 사이트 베이스 URL은 app_settings 에 보관해 도메인 변경 시 한 줄만 고치면 된다.

insert into app_settings (key, value, description)
values (
  'SITE_BASE_URL',
  'https://mih.bp-studio.com',
  '배포 모아보기 사이트 베이스 URL (Discord 알림의 원고 링크에 사용)'
)
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function notify_new_article()
returns trigger as $$
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
    return new;  -- 웹훅 미설정 시 조용히 통과
  end if;

  label := case new.agency
             when 'mih_speaker' then '스피커'
             when 'mih_casting' then '캐스팅'
             when 'mih_agency'  then '에이전시'
             else new.agency
           end;
  color := case new.agency
             when 'mih_speaker' then 1402048   -- 0x1565C0
             when 'mih_casting' then 8067874   -- 0x7B1FA2
             when 'mih_agency'  then 3046962   -- 0x2E7D32
             else 15098112                     -- 0xE65100
           end;

  -- 원고 바로보기 링크 (사이트 URL이 있을 때만)
  link := case
            when site_url is not null and site_url <> ''
            then rtrim(site_url, '/') || '/article/' || new.id
            else null
          end;

  payload := jsonb_build_object(
    'embeds', jsonb_build_array(
      (jsonb_build_object(
        'title', '🆕 신규 원고 등록',
        'color', color,
        'fields', (
          jsonb_build_array(
            jsonb_build_object('name', '제목', 'value', left(new.title, 1024), 'inline', false),
            jsonb_build_object('name', '계정', 'value', label, 'inline', true),
            jsonb_build_object('name', '인물/키워드', 'value', new.person_name, 'inline', true),
            jsonb_build_object('name', '발행일', 'value', new.publish_date::text, 'inline', true)
          )
          -- 링크가 있으면 '바로보기' 필드를 덧붙인다
          || case when link is not null
                  then jsonb_build_array(jsonb_build_object('name', '🔗 원고 바로보기', 'value', link, 'inline', false))
                  else '[]'::jsonb
             end
        ),
        'footer', jsonb_build_object('text', 'MIH Blog Writer · 신규 원고 알림'),
        'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
      -- 링크가 있으면 임베드 title 클릭 시 원고로 이동하도록 url 추가
      || case when link is not null then jsonb_build_object('url', link) else '{}'::jsonb end)
    )
  );

  perform net.http_post(
    url := webhook,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := payload,
    timeout_milliseconds := 10000
  );

  return new;
end;
$$ language plpgsql security definer;
