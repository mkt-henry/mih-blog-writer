// 원고 HTML 기계 검증 함수 모음 (의존성 없음, 순수 함수).
// CLI(scripts/check-article.mjs)와 vitest 테스트가 공유한다.

export const KAKAO_URL = 'https://open.kakao.com/o/snG6VXti';

// 본문 이미지 개수 — 명함/카카오 이미지는 제외
export function countBodyImages(html) {
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  return imgs.filter((t) => !/agency-card|business-card|kakao/i.test(t)).length;
}

// 이미지 출처 표기 개수 ("출처 - ... 공식 SNS|자료").
// SE3 캡션은 <span> 안의 평문이므로 출처~공식 사이에 태그가 없다고 가정한다([^<]).
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

// se-text-paragraph 없이 텍스트가 든 bare <p> 개수
export function findBareParagraphs(html) {
  const blocks = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  return blocks.filter((b) => {
    if (/se-text-paragraph/.test(b)) return false;        // 정상 SE 단락
    if (/<img\b/i.test(b)) return false;                   // 이미지 래퍼
    if (/^<p\b[^>]*>\s*(?:<br\s*\/?>)?\s*<\/p>$/i.test(b)) return false; // 빈 줄
    if (/id="SE-h/i.test(b)) return false;                 // 대제목
    if (/id="SE-intro"/i.test(b)) return false;            // 글 제목
    const text = b.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    return text.length > 0;
  }).length;
}

// table-layout:fixed 없는 <table> 개수
export function tablesMissingFixedLayout(html) {
  const tables = html.match(/<table\b[^>]*>/gi) || [];
  return tables.filter((t) => !/table-layout\s*:\s*fixed/i.test(t)).length;
}

// data: URI 또는 image.png 류 깨지는 src 존재 여부
export function hasBrokenImageSrc(html) {
  return /<img\b[^>]*\bsrc\s*=\s*["'](?:data:image\/|[^"']*\bimage\.png\b)/i.test(html);
}

// 사진 placeholder 존재 여부
export function hasPhotoPlaceholder(html) {
  return /📷\s*사진\s*\d+\s*삽입\s*위치/.test(html);
}

// 본문 명함 이미지 존재 여부
export function hasBusinessCardImg(html) {
  return /<img\b[^>]*(?:agency-card|business-card)[^>]*>/i.test(html);
}

// 카카오 URL 점검 — { count, bad[] }
export function kakaoUrlIssues(html) {
  const all = html.match(/https:\/\/open\.kakao\.com\/o\/[A-Za-z0-9]+/g) || [];
  const bad = [...new Set(all.filter((u) => u !== KAKAO_URL))];
  return { count: all.length, bad };
}

// 해시태그 개수 — 태그(style 속성의 hex 색상 포함)를 먼저 제거하고 본문 텍스트의 #토큰만 센다
export function countHashtags(html) {
  const text = html.replace(/<[^>]+>/g, ' ');
  return (text.match(/#[^\s#<]+/g) || []).length;
}

// 제목 점검 — [이름 섭외] 대괄호 + 30~60자
export function checkTitle(title) {
  const t = (title || '').trim();
  const hasBracket = /^\[[^\]]*섭외\]/.test(t);
  const len = [...t].length;
  return { ok: hasBracket && len >= 30 && len <= 60, hasBracket, len };
}

// 본문 텍스트 글자수 (태그/공백 제거)
export function bodyTextLength(html) {
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ');
  return text.replace(/\s/g, '').length;
}

// 키워드 등장 횟수
export function countKeyword(html, keyword) {
  if (!keyword) return 0;
  const text = html.replace(/<[^>]+>/g, ' ');
  const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(esc, 'g')) || []).length;
}

// 밀도 계산용 본문 — 태그·해시태그를 걷어내고 공백을 단일화한 순수 서술 텍스트.
// bodyTextLength는 공백을 전부 제거하므로 값이 다르다. 상위 노출 문서와 같은
// 방식으로 재기 위해(해시태그 20여 개가 밀도를 부풀린다) 별도로 둔다.
export function bodyProseText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/#[^\s#]+/g, ' ')   // 해시태그 토큰 제외
    .replace(/\s+/g, ' ')
    .trim();
}

// 본문(해시태그 제외) 1000자당 키워드 등장 횟수
export function keywordDensity(html, keyword) {
  const text = bodyProseText(html);
  if (!text.length || !keyword) return 0;
  const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const n = (text.match(new RegExp(esc, 'g')) || []).length;
  return (n / text.length) * 1000;
}

// 해시태그 단락 안에서 키워드를 포함한 태그 개수
export function countHashtagsWithKeyword(html, keyword) {
  if (!keyword) return 0;
  const text = html.replace(/<[^>]+>/g, ' ');
  const tags = text.match(/#[^\s#<]+/g) || [];
  return tags.filter((t) => t.includes(keyword)).length;
}

// 인물 원고 종합 검증 → findings[] ({ level:'fail'|'warn', id, message })
export function runPersonChecks(html, { title } = {}) {
  const findings = [];
  const fail = (id, message) => findings.push({ level: 'fail', id, message });
  const warn = (id, message) => findings.push({ level: 'warn', id, message });

  const imgs = countBodyImages(html);
  if (imgs !== 4) fail('body_images', `본문 이미지 ${imgs}개 (정확히 4개 필요)`);

  const srcs = countSourceCaptions(html);
  if (srcs !== 4) fail('source_captions', `출처 표기 ${srcs}개 (정확히 4개 필요)`);

  const yt = countYoutubeIframes(html);
  if (yt !== 2) fail('youtube_iframe', `유튜브 iframe ${yt}개 (정확히 2개 필요)`);
  const rawYt = countRawYoutubeUrls(html);
  if (rawYt > 0) fail('youtube_raw', `raw 유튜브 URL ${rawYt}개 발견 (iframe만 허용)`);

  const bareP = findBareParagraphs(html);
  if (bareP > 0) fail('bare_paragraph', `se-text-paragraph 없는 본문 <p> ${bareP}개`);

  const badTables = tablesMissingFixedLayout(html);
  if (badTables > 0) fail('table_layout', `table-layout:fixed 없는 <table> ${badTables}개`);

  if (hasBrokenImageSrc(html)) fail('broken_src', 'data: 또는 image.png 류 깨지는 img src 발견');
  if (hasPhotoPlaceholder(html)) fail('placeholder', '📷 사진 삽입 위치 placeholder 발견');
  if (hasBusinessCardImg(html)) fail('business_card', '본문에 명함 이미지(agency-card) 발견');

  const kakao = kakaoUrlIssues(html);
  if (kakao.bad.length > 0) fail('kakao_url', `허용되지 않은 카카오 URL: ${kakao.bad.join(', ')}`);

  const tags = countHashtags(html);
  if (tags < 20) fail('hashtags', `해시태그 ${tags}개 (20개 이상 필요)`);

  if (title !== undefined) {
    const tc = checkTitle(title);
    if (!tc.ok) fail('title', `제목 형식/길이 위반 ([이름 섭외] + 30~60자, 현재 ${tc.len}자)`);
  }

  // 본문 분량 — 해시태그를 뺀 서술 텍스트 기준.
  // 상위 노출 문서 실측 3,883~5,823자에 맞춘다.
  const prose = bodyProseText(html).length;
  if (prose < 3800) fail('prose_length', `본문 ${prose}자 (해시태그 제외 3,800자 이상 필요)`);
  else if (prose > 6000) warn('prose_length', `본문 ${prose}자 (6,000자 이하 권장)`);

  // "섭외" 밀도 — 같은 말 반복 대신 의미 범위를 넓히기 위한 상한.
  // 상위 노출 문서 실측 3.4~6.0회/1000자.
  const density = keywordDensity(html, '섭외');
  if (density > 5) fail('keyword_density', `"섭외" 밀도 ${density.toFixed(1)}회/1000자 (5.0 이하 필요)`);
  else if (density < 3) warn('keyword_density', `"섭외" 밀도 ${density.toFixed(1)}회/1000자 (3.0 이상 권장)`);

  // 해시태그에 키워드를 몰아넣는 것도 반복 신호다. 상위 노출 문서는 0~7개.
  const kwTags = countHashtagsWithKeyword(html, '섭외');
  if (kwTags > 7) fail('hashtag_keyword', `"섭외" 포함 해시태그 ${kwTags}개 (7개 이하 필요)`);

  return findings;
}
