-- 기존 per-INSERT 트리거 제거
DROP TRIGGER IF EXISTS discord_notify_on_publish ON published_posts;
DROP FUNCTION IF EXISTS notify_discord_on_publish();

-- pg_cron 활성화
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 일일 Discord 리포트 함수
CREATE OR REPLACE FUNCTION send_daily_discord_report()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_today        text;
  v_webhook      constant text := 'https://discordapp.com/api/webhooks/1503361197087658076/flMPRAdb4rEle3eno1zLg_fpb7tQ9YEvmrOlqPlqqWbnfvnb6MO1TYajU77gBreIog1m';
  v_total        int  := 0;
  v_rss_field    text := '';
  v_text_lines   text := '';
  v_agency_block text;
  v_agency_count int;
  v_time_str     text;
  v_title_short  text;
  v_keyword      text;
  v_label        text;
  v_slug         text;
  v_rec          record;
  v_slugs        text[] := ARRAY['mih_speaker', 'mih_casting', 'mih_agency'];
BEGIN
  v_today := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');

  FOREACH v_slug IN ARRAY v_slugs LOOP
    v_agency_block := '';
    v_agency_count := 0;

    FOR v_rec IN
      SELECT pp.title, pp.url, pp.published_at
      FROM published_posts pp
      JOIN agencies a ON a.id = pp.agency_id
      WHERE a.slug = v_slug
        AND pp.date = (now() AT TIME ZONE 'Asia/Seoul')::date
      ORDER BY pp.published_at
    LOOP
      v_agency_count := v_agency_count + 1;
      v_total        := v_total + 1;

      v_time_str    := to_char(v_rec.published_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI');
      v_title_short := left(v_rec.title, 30);
      IF length(v_rec.title) > 30 THEN
        v_title_short := v_title_short || '…';
      END IF;

      v_agency_block := v_agency_block || E'\n  `' || v_time_str || '` ' || v_title_short;

      -- "[이름 섭외] ..." 패턴에서 이름 추출
      v_keyword := substring(v_rec.title FROM '^\[([^\]]+) 섭외\]');
      IF v_keyword IS NULL THEN
        v_keyword := left(v_rec.title, 20);
      END IF;

      v_text_lines := v_text_lines || v_keyword || ' 섭외' || E'\n' || v_rec.url || E'\n\n';
    END LOOP;

    IF v_agency_count > 0 THEN
      v_label := CASE v_slug
        WHEN 'mih_speaker' THEN '스피커'
        WHEN 'mih_casting' THEN '캐스팅'
        WHEN 'mih_agency'  THEN '에이전시'
        ELSE v_slug
      END;
      IF v_rss_field != '' THEN
        v_rss_field := v_rss_field || E'\n\n';
      END IF;
      v_rss_field := v_rss_field || '**[' || v_label || ']**' || v_agency_block;
    END IF;
  END LOOP;

  IF v_rss_field = '' THEN
    v_rss_field := '아직 발행된 원고가 없습니다.';
  END IF;

  -- 메시지 1: 임베드
  PERFORM net.http_post(
    url     := v_webhook,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object(
      'embeds', jsonb_build_array(
        jsonb_build_object(
          'title',  '📋 MIH 발행 현황 · ' || v_today,
          'color',  1398208,
          'fields', jsonb_build_array(
            jsonb_build_object(
              'name',   '📡 오늘 발행 (' || v_total || '건)',
              'value',  left(v_rss_field, 1024),
              'inline', false
            )
          ),
          'footer',    jsonb_build_object('text', 'MIH Blog Writer · 매일 10:00 KST'),
          'timestamp', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      )
    )
  );

  -- 메시지 2: 텍스트 (발행 건이 있을 때만)
  IF v_total > 0 THEN
    PERFORM net.http_post(
      url     := v_webhook,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object(
        'content', '▶ ' || v_today || E'\n\n' || rtrim(v_text_lines, E'\n')
      )
    );
  END IF;
END;
$$;

-- 매일 01:00 UTC (10:00 KST) 실행
SELECT cron.schedule(
  'mih-daily-discord',
  '0 1 * * *',
  $$SELECT send_daily_discord_report()$$
);
