// 원고 HTML 기계 검증 함수 모음 (의존성 없음, 순수 함수).
// CLI(scripts/check-article.mjs)와 vitest 테스트가 공유한다.

export const KAKAO_URL = 'https://open.kakao.com/o/snG6VXti';

// 본문 이미지 개수 — 명함/카카오 이미지는 제외
export function countBodyImages(html) {
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  return imgs.filter((t) => !/agency-card|business-card|kakao/i.test(t)).length;
}

// 이미지 출처 표기 개수 ("출처 - ... 공식 SNS|자료")
export function countSourceCaptions(html) {
  return (html.match(/출처\s*-\s*[^<]*?공식\s*(?:SNS|자료)/g) || []).length;
}

// 유튜브 iframe 임베드 개수
export function countYoutubeIframes(html) {
  return (html.match(/<iframe\b[^>]*\byoutube(?:-nocookie)?\.com\/embed\/[^>]*>/gi) || []).length;
}

// raw 유튜브 URL 개수 (있으면 위반)
export function countRawYoutubeUrls(html) {
  return (html.match(/youtube\.com\/watch\?v=|youtu\.be\//g) || []).length;
}
