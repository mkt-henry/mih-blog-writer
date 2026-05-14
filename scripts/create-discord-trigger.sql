CREATE OR REPLACE FUNCTION notify_discord_on_publish()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_agency_slug  text;
  v_agency_label text;
  v_date_str     text;
  v_content      text;
  v_webhook      constant text := 'https://discordapp.com/api/webhooks/1503361197087658076/flMPRAdb4rEle3eno1zLg_fpb7tQ9YEvmrOlqPlqqWbnfvnb6MO1TYajU77gBreIog1m';
BEGIN
  SELECT slug INTO v_agency_slug FROM agencies WHERE id = NEW.agency_id;

  -- U& Unicode escapes: 스피커/캐스팅/에이전시/알수없음
  v_agency_label := CASE v_agency_slug
    WHEN 'mih_speaker' THEN U&'\C2A4\D53C\CEE4'
    WHEN 'mih_casting' THEN U&'\CE90\C2A4\D305'
    WHEN 'mih_agency'  THEN U&'\C5D0\C774\C804\C2DC'
    ELSE COALESCE(v_agency_slug, U&'\C54C\C218\C5C6\C74C')
  END;

  v_date_str := to_char(
    COALESCE(NEW.published_at, now()) AT TIME ZONE 'Asia/Seoul',
    'YYYY-MM-DD'
  );

  -- U&'\25B6' = ▶
  v_content := format(
    U&'\25B6' || ' %s [%s]' || E'\n\n' || '%s' || E'\n' || '%s',
    v_date_str,
    v_agency_label,
    NEW.title,
    NEW.url
  );

  PERFORM net.http_post(
    url     := v_webhook,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('content', v_content)
  );

  RETURN NEW;
END;
$$;
