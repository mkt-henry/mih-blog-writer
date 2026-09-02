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

// Vercel Blob에 올린 이미지 개수 — 원고 이미지는 Supabase 버킷만 쓴다.
export function countVercelBlobImages(html) {
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  return imgs.filter((t) => /\bsrc\s*=\s*["'][^"']*blob\.vercel-storage\.com/i.test(t)).length;
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
/**
 * 제목 검사.
 *
 * 2026-08-15 실측으로 기준을 바꿨다. 13개 키워드 × 상위 5건(문서쌍 104개)에서
 * 네이버 순위를 얼마나 재현하는지 잰 결과:
 *   제목에 `섭외` 포함     78.1%   ← 지금까지 잰 모든 신호 중 최고
 *   제목에 인물명 포함     67.9%
 *   제목 길이              50.0%   ← 무관. 1위 평균 39자, 2위 48자, 5위 35자
 *   제목에 숫자            31.9%   ← 뒤집으면 68%. 숫자가 있으면 밀린다
 *
 * 반면 `[인물명 섭외]` 대괄호 형식을 지킨 1위 글은 13개 중 4개뿐이었다.
 * 그래서 **대괄호 형식과 길이 제한을 풀고, 근거가 있는 두 가지(인물명·섭외 포함)만 남긴다.**
 *
 * personName 을 넘기지 않으면 인물명 검사는 건너뛴다.
 */
export function checkTitle(title, personName) {
  const t = (title || '').trim();
  const hasKeyword = t.includes('섭외');
  const hasName = personName ? t.includes(String(personName).trim()) : true;
  const hasDigit = /\d/.test(t);
  const len = [...t].length;
  return { ok: hasKeyword && hasName, hasKeyword, hasName, hasDigit, len };
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

// 인물명 반복 횟수 — 관문에서 가장 강한 신호다(2026-09-02 실측).
//
// 세는 대상이 까다롭다. 파일명 슬러그는 등록명(`DJ PLUMM`)이지만, 원고 본문은
// **한글 독음**(`플럼`)으로 부른다 — 검색자가 한글로 치기 때문이다. 슬러그로만 세면
// 0회가 나와 규칙이 영영 작동하지 않는다. 그래서 제목 대괄호 안의 이름까지 후보로
// 넣고, 괄호 안팎을 갈라 **가장 많이 등장한 표기**를 그 원고의 인물명 반복으로 본다.
export function personNameCandidates(personName, title) {
  const out = new Set();
  const add = (v) => { const t = String(v ?? '').trim(); if (t.length >= 2) out.add(t); };
  const split = (v) => {
    add(v);
    const m = String(v ?? '').match(/^(.*?)[（(]([^）)]*)[）)]/);
    if (m) { add(m[1]); add(m[2]); }
  };
  split(personName);
  const bracket = String(title ?? '').match(/^\s*\[([^\]]+)\]/)?.[1];
  if (bracket) split(bracket.replace(/\s*섭외\s*$/, ''));
  return [...out];
}

// 제목·본문에 남은 영문명 — 한글 검색만 겨루므로 영문 표기는 원고에 있을 이유가 없다.
//
// 등록명에 한글과 영문이 **둘 다** 있는 경우(`2NE1 (투애니원)`, `첸(CHEN)`)만 잡는다.
// 그때는 어느 쪽이 한글 표기인지 확실히 알 수 있다. 영문만 등록된 이름
// (`SF9`, `2PM`, `10CM`, `god`)은 통용 한글 표기가 있는지를 기계가 알 수 없고,
// 실제로 사람들도 로마자로 검색하므로 건드리지 않는다.
export function foreignNameForm(personName) {
  const raw = String(personName ?? '').trim();
  const m = raw.match(/^([^（(]*)[（(]([^）)]*)[）)](.*)$/);
  if (!m) return null;
  const outside = `${m[1]} ${m[3]}`.replace(/\s+/g, ' ').trim();
  const inside = m[2].trim();
  const kor = (t) => /[가-힣]/.test(t);
  const lat = (t) => /[A-Za-z]/.test(t);
  if (kor(inside) && lat(outside) && !kor(outside)) return { latin: outside, korean: inside };
  if (kor(outside) && lat(inside) && !kor(inside)) return { latin: inside, korean: outside };
  return null;
}

export function foreignNameLeaks(html, personName, title) {
  const form = foreignNameForm(personName);
  if (!form) return null;
  const esc = form.latin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc, 'gi');
  const inTitle = re.test(String(title ?? ''));
  const inBody = (bodyProseText(html).match(re) || []).length;
  return inTitle || inBody ? { ...form, inTitle, inBody } : null;
}

export function personNameRepeats(html, personName, title) {
  const text = bodyProseText(html);
  let best = 0, form = null;
  for (const v of personNameCandidates(personName, title)) {
    const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const n = (text.match(new RegExp(esc, 'g')) || []).length;
    if (n > best) { best = n; form = v; }
  }
  return { count: best, form };
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

// ── 중복 서술 검사 ────────────────────────────────────────────────────────
//
// 왜 기계 검사로 올렸나 (2026-08-22 실측):
// 체인 첫 주 98편에서 검수를 1회에 통과한 것은 3편뿐이었고, 74%가 "중복 서술"로 needs-fix 를
// 받았다(프로필 표 반복 나열 · 섹션 간 내용 겹침). 검수 에이전트만 잡고 있었기 때문에
// 매편 작성→검수 라운드를 한 번씩 더 태우고 있었다. 아래 둘은 결정적으로 잴 수 있다.

const stripTags = (h) =>
  h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

// 표를 뺀 순수 산문(해시태그 제외). 표 자체는 반복의 "원본"이라 세는 대상에서 뺀다.
export function proseWithoutTables(html) {
  return stripTags(html.replace(/<table[\s\S]*?<\/table>/gi, ' ').replace(/#[^\s#<]+/g, ' '));
}

// 표 셀에서 작품·프로그램·수상명을 뽑는다. 따옴표·홑화살괄호로 감싼 토큰만 본다 —
// 일반 명사까지 세면 오탐이 폭발한다.
export function tableItems(html) {
  const cells = [];
  for (const tbl of html.match(/<table[\s\S]*?<\/table>/gi) || [])
    for (const td of tbl.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []) cells.push(stripTags(td));
  const out = new Set();
  for (const cell of cells)
    for (const m of cell.match(/['‘“"〈《「]([^'’”"〉》」]{2,30})['’”"〉》」]/g) || []) {
      const t = m.slice(1, -1).trim();
      if (t.length >= 2) out.add(t);
    }
  return [...out];
}

/**
 * 표에 있는 작품명이 본문에서 몇 번 되풀이되는지 — [{ item, count }] (많은 순).
 * 인물명 자체는 뺀다(원고 전체에서 반복되는 것이 정상이다).
 */
export function tableItemEchoes(html, personName) {
  const prose = proseWithoutTables(html);
  const name = String(personName || '').trim();
  return tableItems(html)
    .filter((it) => !name || (!name.includes(it) && !it.includes(name)))
    .map((item) => ({ item, count: prose.split(item).length - 1 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
}

// 한국어 종결어미(다./요.) 기준 문장 분해. 마침표만 쓰면 'Circus D.' 같은 데서 쪼개진다.
export function proseSentences(html) {
  return proseWithoutTables(html)
    .split(/(?<=[다요])\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
}

/**
 * 같은 말을 두 번 한 문장쌍 — [{ a, b, overlap }].
 * 짧은 쪽 기준 포함률로 잰다(한 문장이 다른 문장을 통째로 삼킨 경우를 잡기 위해).
 */
export function duplicateSentencePairs(html, threshold = 0.6) {
  const K = 8;
  const shingle = (t) => {
    const c = t.replace(/[\s,·\-–—()"'’‘“”[\]]/g, '');
    const s = new Set();
    for (let i = 0; i + K <= c.length; i++) s.add(c.slice(i, i + K));
    return s;
  };
  const sents = proseSentences(html).map((s) => ({ s, g: shingle(s) })).filter((x) => x.g.size >= 10);
  const pairs = [];
  for (let i = 0; i < sents.length; i++)
    for (let j = i + 1; j < sents.length; j++) {
      const [S, L] = sents[i].g.size < sents[j].g.size ? [sents[i].g, sents[j].g] : [sents[j].g, sents[i].g];
      let n = 0;
      for (const g of S) if (L.has(g)) n++;
      const overlap = n / S.size;
      if (overlap >= threshold) pairs.push({ a: sents[i].s, b: sents[j].s, overlap });
    }
  return pairs.sort((x, y) => y.overlap - x.overlap);
}

/**
 * 인물 원고 종합 검증 → findings[] ({ level:'fail'|'warn', id, message })
 *
 * 규칙은 두 종류다. 섞으면 안 된다 (2026-08-15 정리).
 *
 * **[형식] 발행을 막는다(fail).** 원고가 네이버 에디터에서 제대로 보이는가, 링크·이미지가
 * 살아 있는가를 본다. 순위와는 무관하지만 깨진 채로 나가면 사고다.
 *
 * **[순위] 실측 근거가 있는 것만 막는다.** 근거 없는 항목은 warn 으로 내렸다.
 * 근거는 13개 키워드 × 상위 5건(문서쌍 104개)에서 네이버 순위 재현율을 잰 결과다.
 * 하위권 글이 우리 규칙을 상위권만큼(어떤 항목은 더 잘) 지키고 있었고,
 * **실제 1위 글 13개 중 종전 검사를 전부 통과하는 것은 3개뿐이었다.**
 */
export function runPersonChecks(html, { title, personName } = {}) {
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

  const blobImgs = countVercelBlobImages(html);
  if (blobImgs > 0) {
    fail(
      'blob_image_src',
      `Vercel Blob 이미지 ${blobImgs}개 (Supabase 버킷 URL만 허용) — ` +
        `node scripts/upload-article-images.js "<html>" <인물이름> <ascii-slug> 로 옮기세요`
    );
  }
  if (hasPhotoPlaceholder(html)) fail('placeholder', '📷 사진 삽입 위치 placeholder 발견');
  if (hasBusinessCardImg(html)) fail('business_card', '본문에 명함 이미지(agency-card) 발견');

  const kakao = kakaoUrlIssues(html);
  if (kakao.bad.length > 0) fail('kakao_url', `허용되지 않은 카카오 URL: ${kakao.bad.join(', ')}`);

  // [순위] 해시태그 개수 — 상위 42% / 하위 43% 로 판별력이 없었다. 발행을 막지 않는다.
  const tags = countHashtags(html);
  if (tags < 20) warn('hashtags', `해시태그 ${tags}개 (20개 이상 권장 — 순위와의 관계는 확인되지 않음)`);

  // [순위] 제목 — 지금까지 잰 신호 중 가장 강하다(섭외 포함 78.1%, 인물명 포함 67.9%).
  // 대괄호 형식과 길이 제한은 근거가 없어 풀었다(§checkTitle 주석).
  if (title !== undefined) {
    const tc = checkTitle(title, personName);
    // 상위 69% / 하위 48% 로 갈린다. 유일하게 게이트로 세울 만한 순위 신호다.
    if (!tc.hasKeyword) fail('title_keyword', '제목에 "섭외"가 없다 (상위 69% / 하위 48%로 갈리는 가장 강한 신호)');
    // 상위 46% / 하위 38% 로 판별력이 약하고, 표기 변형에 오탐한다 —
    // 실측에서 "전진" 1위 글 제목은 `[신화 섭외]`, "케이타이거즈"는 `K타이거즈`였다.
    // 둘 다 맞는 글인데 단순 문자열 비교로는 걸린다. 그래서 경고까지만 한다.
    if (!tc.hasName) warn('title_name', `제목에 인물명("${personName}")이 그대로 없다 (그룹명·약칭이면 무시해도 된다)`);
    if (tc.hasDigit) warn('title_digit', '제목에 숫자가 있다 (숫자 있는 제목이 밀리는 경향 — 재현율 31.9%)');
  }

  // 본문 분량 — 해시태그를 뺀 서술 텍스트 기준.
  //
  // 하한을 3,800자에서 1,500자로 내렸다(2026-08-15).
  // 종전 근거였던 "상위 노출 문서 실측 3,883~5,823자"는 네이버 블로그 HTML 에서 본문을
  // 분리하지 못해 사이트 UI 문구("안부글 작성횟수", "이웃추가", "블로그 마켓" 등)까지
  // 길이에 포함한 값이었다. 본문(se-main-container)만 뽑아 다시 재니 전혀 다른 분포가 나왔다.
  //
  // 재측정: 발행 키워드 8종 × `"<인물명> 섭외"` 상위 3건 = 20개 문서
  //   최소 640 / p25 1,361 / 중앙 2,117 / p75 3,831 / 최대 10,647 (평균 2,779)
  // 즉 종전 하한 3,800자는 **실제로 상위에 오른 문서의 4분의 3을 발행 불가로 막는 값**이었다.
  //
  // 길이가 순위를 만든다는 뜻은 아니다(10,647자짜리도 상위에 있다). 확인된 것은
  // "짧아서 못 오르는 것은 아니다" 뿐이라, 하한은 최소한의 정보량만 보장하는 선으로 두고
  // 분량 판단은 작성자에게 맡긴다. 상한은 그대로 권장(warn)이다.
  const prose = bodyProseText(html).length;
  if (prose < 1500) fail('prose_length', `본문 ${prose}자 (해시태그 제외 1,500자 이상 필요)`);
  else if (prose > 6000) warn('prose_length', `본문 ${prose}자 (6,000자 이하 권장)`);

  // [순위] "섭외" 밀도 — 발행 게이트에서 내렸다(2026-08-15).
  //
  // 실측: 밀도 3.0 이상 준수율이 상위 46% / 하위 38%, 5.0 이하 준수율이 상위 73% / 하위 71%.
  // **양쪽 다 판별력이 없다.** 실제 1위 글 중에 밀도 10.5(로꼬)·9.0(후디)도 있고
  // 0.2(시옷시옷)·0.4(백은하)도 있다. 양극단이 모두 1위를 하고 있어 이 값으로는
  // 아무것도 설명되지 않는다.
  //
  // 그래도 상한을 완전히 없애지는 않는다 — 관측된 최대가 10.5 였으므로 그보다 훨씬 높은
  // 값은 정상 문서에서 나오지 않는 어뷰징이다. 게이트를 15 로 올리고, 5 초과는 경고로 남긴다.
  // [순위] 인물명 반복 — 지금까지 잰 신호 중 관문에서 가장 강하다 (2026-09-02).
  //
  //   우리 발행분 101편: 18회 미만 노출률 65% / 18회 이상 26%.
  //   1페이지에 오른 경쟁 글 15,784건: 인물명 반복 중앙값 8회, 18회 넘는 글은 21%뿐.
  //   같은 경쟁 글을 순위별로 보면 1위 7회 → 9~10위 12회로 아래로 갈수록 늘어난다.
  //
  // 두 표본이 같은 방향을 가리키는 유일한 항목이라 **발행을 막는다.**
  // (제목 길이·본문 길이도 우리 발행분에서는 갈렸지만 경쟁 글 분포가 기각했다.)
  //
  // 카테고리 원고는 빼야 한다. 타입 판별이 "이미지가 있으면 인물 원고"라서
  // 이미지를 넣은 카테고리 원고(`강연섭외`, `행사섭외` 등)가 인물 원고로 넘어온다.
  // 그런 글은 카테고리 키워드를 반복하는 것이 정상이라 이 규칙으로 막으면 안 된다.
  // 등록명에 `섭외`가 들어 있으면 인물이 아니다 — 사람 이름에는 절대 안 들어간다.
  // [순위] 제목·본문의 영문명 — 한글 검색만 겨룬다(2026-09-02).
  // 병기를 늘려도 한글 검색 순위는 달라지지 않는다. 영문 표기는 원고에 있을 이유가 없다.
  const leak = foreignNameLeaks(html, personName, title);
  if (leak)
    fail('foreign_name_in_text', `제목·본문에 영문명("${leak.latin}")이 있다 — 한글 표기("${leak.korean}")만 쓴다 (제목 ${leak.inTitle ? '있음' : '없음'} · 본문 ${leak.inBody}회)`);

  const isCategory = /섭외/.test(String(personName ?? ''));
  const rep = isCategory ? { count: 0, form: null } : personNameRepeats(html, personName, title);
  if (rep.count >= 22)
    fail('person_name_repeat', `인물명("${rep.form}") ${rep.count}회 반복 — 22회 이상은 발행 불가 (1페이지 글 중앙값 8회, 권장 14회 이하)`);
  else if (rep.count >= 18)
    warn('person_name_repeat', `인물명("${rep.form}") ${rep.count}회 반복 (18회 이상 — 노출률이 65%에서 26%로 떨어지는 구간, 14회 이하 권장)`);

  // [순위] "섭외" 총 횟수 — 인물명과 같은 원인으로 보이나 단독으로는 경계선이라 경고만.
  const seobCount = (bodyProseText(html).match(/섭외/g) || []).length;
  if (seobCount >= 18)
    warn('keyword_count', `"섭외" ${seobCount}회 (18회 이상 — 인물명 반복과 같이 줄인다)`);

  const density = keywordDensity(html, '섭외');
  if (density > 15) fail('keyword_density', `"섭외" 밀도 ${density.toFixed(1)}회/1000자 — 어뷰징 수준 (관측된 상위 노출 문서 최대 10.5)`);
  else if (density > 5) warn('keyword_density', `"섭외" 밀도 ${density.toFixed(1)}회/1000자 (5.0 초과 — 순위와의 관계는 확인되지 않음)`);

  // [순위] 섭외 해시태그 개수 — 하위권이 오히려 더 잘 지켰다(상위 85% / 하위 100%).
  // 발행을 막을 근거가 없다.
  const kwTags = countHashtagsWithKeyword(html, '섭외');
  if (kwTags > 7) warn('hashtag_keyword', `"섭외" 포함 해시태그 ${kwTags}개 (7개 이하 권장 — 순위와의 관계는 확인되지 않음)`);

  // 중복 서술 — 체인 첫 주 검수 지적 1위(98편 중 74%)를 결정적 검사로 옮긴 것.
  // 임계는 발행분 91편 실측으로 잡았다: 같은 항목 3회 이상 33%, 5회 이상 8%.
  // 3회는 경고(작성자가 스스로 걷어내는 선), 5회는 발행을 막는다(정상 원고에서 안 나온다).
  const echoes = tableItemEchoes(html, personName);
  const heavy = echoes.filter((e) => e.count >= 5);
  const some = echoes.filter((e) => e.count >= 3);
  const fmt = (list) => list.slice(0, 5).map((e) => `${e.item}×${e.count}`).join(', ');
  if (heavy.length > 0)
    fail('dup_table_echo', `프로필 표 항목을 본문이 5회 이상 되풀이 — ${fmt(heavy)} (표에 있는 항목은 본문에서 한 번만 풀어쓴다)`);
  else if (some.length > 0)
    warn('dup_table_echo', `프로필 표 항목을 본문이 3회 이상 되풀이 — ${fmt(some)}`);

  const dupPairs = duplicateSentencePairs(html);
  if (dupPairs.length > 0)
    warn(
      'dup_sentence',
      `같은 내용을 두 번 쓴 문장 ${dupPairs.length}쌍 — 예: "${dupPairs[0].a.slice(0, 40)}…" / "${dupPairs[0].b.slice(0, 40)}…"`
    );

  return findings;
}
