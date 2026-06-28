-- 계정별 공개 피드(AccountFeed)에서 "발행 예약 완료" 표시한 원고를 숨기기 위한 컬럼.
-- reserved_at IS NULL  → 피드 노출
-- reserved_at 값 있음   → 사용자가 발행 예약을 잡아둔 원고(피드에서 숨김, 되돌리기 가능)
alter table articles add column if not exists reserved_at timestamptz;

-- 노출 후보(미발행 + 미예약) 조회 핫패스용 부분 인덱스.
create index if not exists articles_feed_visible_idx
  on articles (agency, created_at desc)
  where published_at is null and reserved_at is null;
