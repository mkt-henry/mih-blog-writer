-- articles 테이블에 신규 원고가 INSERT되면 Discord 웹훅으로 실시간 알림.
--
-- 기존 'mih-daily-discord' cron(매일 09:30 RSS 발행현황 요약)과는 별개다.
-- 이건 행이 추가되는 즉시 한 건씩 알린다.
--
-- 동작 범위(사용자 확정): "직접 작성한 원고만".
--   · npm run publish / npm run upload 로 올린 원고 → published_source NULL → 알림 O
--   · rss-sync Edge Function이 네이버에서 자동 누적한 행 → published_source 'rss' → 알림 X
-- upsert 재발행은 ON CONFLICT DO UPDATE 라 UPDATE 트리거로 처리되므로,
-- AFTER INSERT 트리거는 '진짜 새 행'에만 발화한다(재발행 중복 알림 없음).
--
-- net.http_post(pg_net)는 비동기 큐 방식이라 Discord가 죽어도 INSERT를 막지 않는다.
-- 기존 cron 잡들이 이미 net.http_post 를 쓰고 있어 pg_net 은 활성화된 상태다.

------------------------------------------------------------
-- 웹훅 URL은 app_settings 에 보관(나머지 비밀값과 동일 패턴, 회전 용이)
------------------------------------------------------------
insert into app_settings (key, value, description)
values (
  'DISCORD_NEW_ARTICLE_WEBHOOK_URL',
  'https://discord.com/api/webhooks/1515145113943281769/EILqu24uSnwVFIrWzMjX6W0rDuqJyYyoqcqOrm8F5BRG75jWcMNvY9YJOqzbF9wrHhvi',
  '신규 원고 INSERT 시 실시간 알림 Discord 웹훅'
)
on conflict (key) do update set value = excluded.value, updated_at = now();

------------------------------------------------------------
-- 트리거 함수
------------------------------------------------------------
create or replace function notify_new_article()
returns trigger as $$
declare
  webhook text;
  label   text;
  color   int;
  payload jsonb;
begin
  select value into webhook from app_settings where key = 'DISCORD_NEW_ARTICLE_WEBHOOK_URL';
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

  payload := jsonb_build_object(
    'embeds', jsonb_build_array(jsonb_build_object(
      'title', '🆕 신규 원고 등록',
      'color', color,
      'fields', jsonb_build_array(
        jsonb_build_object('name', '제목', 'value', left(new.title, 1024), 'inline', false),
        jsonb_build_object('name', '계정', 'value', label, 'inline', true),
        jsonb_build_object('name', '인물/키워드', 'value', new.person_name, 'inline', true),
        jsonb_build_object('name', '발행일', 'value', new.publish_date::text, 'inline', true)
      ),
      'footer', jsonb_build_object('text', 'MIH Blog Writer · 신규 원고 알림'),
      'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ))
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

------------------------------------------------------------
-- 트리거: 새 행에만, rss-sync 누적분 제외
------------------------------------------------------------
drop trigger if exists articles_notify_new on articles;
create trigger articles_notify_new
  after insert on articles
  for each row
  when (new.published_source is distinct from 'rss')
  execute function notify_new_article();
