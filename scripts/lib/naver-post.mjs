// 네이버 블로그 글 1건을 받아 제목·본문 텍스트로 만든다.
//
// 순위 학습·평가용 코퍼스(`mih_serp_docs`)를 채우는 데 쓴다. 우리 원고가 아니라
// **경쟁 글**을 받아 오는 것이 목적이라, 사이트 UI 문구를 본문에 섞으면 안 된다 —
// 예전에 그것 때문에 "상위 노출 문서 3,883~5,823자"라는 틀린 기준선이 나왔다
// (설계 문서 §check-article prose_length 주석).
//
// 요청 예절: 순차 + 요청 간 지연 + 429/5xx 지수 백오프. diag-reconcile.mjs 의 probe() 와 같은 규칙.

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 어떤 형태의 블로그 URL이든 모바일 PostView 로 정규화한다.
export function toMobileUrl(u) {
  try {
    const url = new URL(u);
    let logNo = url.searchParams.get('logNo');
    let id;
    if (logNo) id = url.searchParams.get('blogId') || url.pathname.split('/').filter(Boolean)[0];
    else { const p = url.pathname.split('/').filter(Boolean); id = p[0]; logNo = p[1]; }
    if (!id || !logNo) return null;
    return { url: `https://m.blog.naver.com/PostView.naver?blogId=${id}&logNo=${logNo}`, blogId: id, logNo };
  } catch { return null; }
}

const stripTags = (h) =>
  h.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// 본문 컨테이너 후보. 네이버 블로그는 세대마다 마크업이 다르고, **오래된 글일수록
// 오래된 마크업**이다. SE3 만 보면 상위에 오래 머무는 옛 글들이 통째로 빠져
// 데이터셋이 최신 글 쪽으로 치우친다(실측: 첫 121건에서 18%가 이 이유로 유실됐다).
const CONTAINERS = [
  /<div[^>]*class="[^"]*\bse-main-container\b/i,        // SE3 (현행)
  /<div[^>]*class="[^"]*\bse_component_wrap\b/i,        // SE2
  /<div[^>]*\bid="viewTypeSelector"/i,                  // 구 에디터 (class="post_ct")
  /<div[^>]*\bid="postViewArea"/i,                      // 더 오래된 글
];
// 본문이 끝나는 지점. 공감·댓글·이웃추가 영역이 붙으면 길이가 통째로 오염된다.
const BODY_END = /<div[^>]*(?:id="floating_bottom|id="area_sympathy|class="[^"]*(?:post_btn|area_sympathy|blog2_container_bottom|wrap_postcomment|_postCommentArea))/i;

/**
 * 본문 컨테이너만 잘라 텍스트로. 컨테이너를 못 찾으면 null —
 * 페이지 전체를 본문으로 쓰느니 그 글을 버리는 편이 낫다(UI 문구가 길이를 부풀린다).
 */
function bodyHtml(html) {
  let start = -1;
  for (const re of CONTAINERS) {
    const i = html.search(re);
    if (i >= 0) { start = i; break; }
  }
  if (start < 0) return null;
  // 닫는 태그 짝을 세지 않고 다음 섹션 경계까지 자른다 — 텍스트만 쓰므로 충분하다.
  const rest = html.slice(start);
  const end = rest.search(BODY_END);
  return end > 0 ? rest.slice(0, end) : rest;
}

export function extractPostText(html) {
  const b = bodyHtml(html);
  if (b === null) return null;
  const text = stripTags(b);
  return text.length >= 200 ? text : null;
}

// 본문의 **구성**을 센다. 텍스트만 저장하던 시절에는 잴 수 없던 것 —
// "원고 품질이 순위와 무관하다"를 말하려면 길이·키워드 말고 이쪽을 재야 한다.
//
// 클래스 등장 횟수를 세면 안 된다. SE3 모듈은 자식 요소마다 같은 접두어를 달아서
// (`se-module-image` 가 이미지 1장에 두세 번 나온다) 숫자가 통째로 부푼다.
// **`se-component se-<종류>` 컨테이너만** 센다. 우리 발행글 1건으로 맞춰 본 값:
// 이미지 5(본문 4 + 명함) · 영상 2 — 정답과 일치한다.
//
// 유튜브는 `<iframe>` 이 아니라 `se-oembed` 자리표시자로 저장되고 iframe 은 화면에서
// 만들어진다. iframe 만 세면 영상이 **0개로 나온다**(실제로 그렇게 나왔다).
//
// se-* 가 없는 옛 에디터 글에는 원시 태그 수로 떨어진다.
export function extractStructure(html) {
  let b = bodyHtml(html);
  if (b === null) return null;
  b = b.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const n = (re) => (b.match(re) ?? []).length;
  const comp = (t) => n(new RegExp(`class="[^"]*\bse-component\b[^"]*\bse-${t}\b`, 'gi'));
  return {
    img: comp('image') + comp('imageStrip') || n(/<img\b(?![^>]*(?:sticker|emoticon))/gi),
    video: comp('oembed') + comp('video') || n(/<iframe\b/gi),
    table: comp('table') || n(/<table\b/gi),
    heading: comp('sectionTitle') + comp('documentTitle') || n(/<h[1-4]\b/gi),
    quote: comp('quotation'),
    link: comp('oglink'),
    map: comp('placesMap') + comp('map'),
    para: n(/<p[^>]*class="[^"]*\bse-text-paragraph\b/gi) || n(/<p\b/gi),
  };
}

export function extractTitle(html) {
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i);
  if (og) return og[1].trim();
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  return t ? stripTags(t[1]) : null;
}

/**
 * 글 1건 수집 → { ok, status, title, text, note }.
 * 삭제된 글은 ok:false, note:'noPost' (재시도하지 않는다).
 */
export async function fetchPost(rawUrl, { maxRetry = 4 } = {}) {
  const m = toMobileUrl(rawUrl);
  if (!m) return { ok: false, status: 0, note: 'bad-url' };
  let delay = 1500;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const res = await fetch(m.url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      const html = await res.text();
      if (/errorType=noPost|삭제되었거나 존재하지 않는|존재하지 않는 게시물/.test(html))
        return { ok: false, status: res.status, note: 'noPost' };
      if (res.status === 200) {
        const text = extractPostText(html);
        if (text) return { ok: true, status: 200, title: extractTitle(html), text, struct: extractStructure(html), blogId: m.blogId, logNo: m.logNo };
        // 정상 페이지인데 컨테이너만 못 찾았다면 재시도해도 같은 결과다.
        // 그대로 기록하고 넘어간다 — 4회 백오프(최대 40초)를 태울 이유가 없다.
        if (/blog\.naver|se_component|post_ct|__clipContent/.test(html))
          return { ok: false, status: 200, note: 'no-container', blogId: m.blogId, logNo: m.logNo };
        // 그 외 200(차단·빈 응답)은 일시적일 수 있으니 재시도
      }
      await sleep(delay); delay = Math.min(delay * 2, 20000);
    } catch {
      await sleep(delay); delay = Math.min(delay * 2, 20000);
    }
  }
  return { ok: false, status: -1, note: 'unknown' };
}
