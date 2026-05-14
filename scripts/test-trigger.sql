INSERT INTO published_posts (agency_id, url, title, date, published_at)
SELECT id,
  'https://blog.naver.com/test/000002',
  U&'[\D14C\C2A4\D2B8] \D55C\AE00 \D14C\C2A4\D2B8 \D3EC\C2A4\D2B8',
  CURRENT_DATE,
  now()
FROM agencies WHERE slug = 'mih_casting' LIMIT 1
RETURNING id;
