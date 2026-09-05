import { describe, it, expect } from 'vitest';
import {
  countBodyImages,
  countSourceCaptions,
  countYoutubeIframes,
  countRawYoutubeUrls,
} from '@/scripts/lib/article-checks.mjs';
import {
  findBareParagraphs,
  tablesMissingFixedLayout,
  hasBrokenImageSrc,
  hasPhotoPlaceholder,
  hasBusinessCardImg,
  kakaoUrlIssues,
  countHashtags,
  countVercelBlobImages,
} from '@/scripts/lib/article-checks.mjs';

const SUPA = 'https://djtmniygzdbavxwrppxb.supabase.co/storage/v1/object/public/article-images';
const BLOB = 'https://un1nlrbeiyjhkrdj.public.blob.vercel-storage.com/article-images';

const IMG = (src: string) => `<p align="center"><img src="${src}" width="544"></p>`;

describe('countBodyImages', () => {
  it('counts article images, excludes business-card/agency-card', () => {
    const html =
      IMG('https://x/article-images/iu/img1.jpg') +
      IMG('https://x/article-images/iu/img2.jpg') +
      IMG('https://x/agency-card-speaker.png');
    expect(countBodyImages(html)).toBe(2);
  });
  it('excludes images whose src contains "kakao"', () => {
    const html =
      IMG('https://x/article-images/iu/img1.jpg') +
      IMG('https://x/kakao-open-chat-qr.png');
    expect(countBodyImages(html)).toBe(1);
  });
  it('returns 0 for HTML with no images', () => {
    expect(countBodyImages('<p>본문만 있음</p>')).toBe(0);
  });
});

describe('countSourceCaptions', () => {
  it('counts "출처 - ... 공식 SNS|자료" captions', () => {
    const html = '출처 - 아이유 공식 SNS<br>출처 - 아이유 공식 자료';
    expect(countSourceCaptions(html)).toBe(2);
  });
});

describe('countYoutubeIframes', () => {
  it('counts youtube embed iframes', () => {
    const html =
      '<iframe src="https://www.youtube.com/embed/AAA"></iframe>' +
      '<iframe src="https://www.youtube-nocookie.com/embed/BBB"></iframe>';
    expect(countYoutubeIframes(html)).toBe(2);
  });
});

describe('countRawYoutubeUrls', () => {
  it('detects raw watch / youtu.be URLs', () => {
    const html = 'https://www.youtube.com/watch?v=AAA and https://youtu.be/BBB';
    expect(countRawYoutubeUrls(html)).toBe(2);
  });
  it('returns 0 when only embeds present', () => {
    expect(countRawYoutubeUrls('<iframe src="https://www.youtube.com/embed/AAA"></iframe>')).toBe(0);
  });
});

const SE_P = '<p class="se-text-paragraph se-text-paragraph-align- " id="SE-1"><span>본문</span></p>';

describe('findBareParagraphs', () => {
  it('flags <p> with text but no se-text-paragraph class', () => {
    const html = SE_P + '<p>그냥 단락</p>';
    expect(findBareParagraphs(html)).toBe(1);
  });
  it('ignores spacers, images, 대제목', () => {
    const html = SE_P + '<p><br></p>' + '<p align="center"><img src="x"></p>' +
      '<p id="SE-h1"><span><b>제목</b></span></p>';
    expect(findBareParagraphs(html)).toBe(0);
  });
});

describe('tablesMissingFixedLayout', () => {
  it('flags tables without table-layout:fixed', () => {
    const html = '<table style="width:100%;"></table><table style="table-layout:fixed;"></table>';
    expect(tablesMissingFixedLayout(html)).toBe(1);
  });
});

describe('hasBrokenImageSrc', () => {
  it('detects data URI and image.png placeholder src', () => {
    expect(hasBrokenImageSrc('<img src="data:image/png;base64,xx">')).toBe(true);
    expect(hasBrokenImageSrc('<img src="image.png">')).toBe(true);
    expect(hasBrokenImageSrc('<img src="https://x/article-images/iu/img1.jpg">')).toBe(false);
  });
});

describe('countVercelBlobImages', () => {
  it('counts img src pointing at Vercel Blob', () => {
    const html = IMG(`${BLOB}/iu/img1.jpg`) + IMG(`${SUPA}/iu/img2.jpg`);
    expect(countVercelBlobImages(html)).toBe(1);
  });
  it('returns 0 when every image is on Supabase', () => {
    const html = IMG(`${SUPA}/iu/img1.jpg`) + IMG(`${SUPA}/iu/img2.jpg`);
    expect(countVercelBlobImages(html)).toBe(0);
  });
  it('ignores a Blob URL that is not an img src', () => {
    expect(countVercelBlobImages(`<p>${BLOB}/iu/img1.jpg 참고</p>`)).toBe(0);
  });
});

describe('hasPhotoPlaceholder', () => {
  it('detects 📷 사진 N 삽입 위치 placeholder', () => {
    expect(hasPhotoPlaceholder('📷 사진 1 삽입 위치')).toBe(true);
    expect(hasPhotoPlaceholder('정상 본문')).toBe(false);
  });
});

describe('hasBusinessCardImg', () => {
  it('detects business-card / agency-card img in body', () => {
    expect(hasBusinessCardImg('<img src="https://x/agency-card-speaker.png">')).toBe(true);
    expect(hasBusinessCardImg('<img src="https://x/article-images/iu/img1.jpg">')).toBe(false);
  });
});

describe('kakaoUrlIssues', () => {
  it('flags non-canonical kakao URLs', () => {
    const r = kakaoUrlIssues('https://open.kakao.com/o/snG6VXti https://open.kakao.com/o/WRONG');
    expect(r.count).toBe(2);
    expect(r.bad).toEqual(['https://open.kakao.com/o/WRONG']);
  });
  it('de-duplicates repeated bad URLs in bad[] but counts all occurrences', () => {
    const r = kakaoUrlIssues('https://open.kakao.com/o/WRONG and https://open.kakao.com/o/WRONG');
    expect(r.count).toBe(2);
    expect(r.bad).toEqual(['https://open.kakao.com/o/WRONG']);
  });
});

describe('countHashtags', () => {
  it('counts # tokens', () => {
    expect(countHashtags('#가수 #섭외 #공연')).toBe(3);
  });
  it('does not count CSS hex colors in style attributes', () => {
    const html =
      '<p class="se-text-paragraph" style="color:#111111; background:#444444;"><span>본문</span></p>' +
      '<p class="se-text-paragraph"><span style="color:#999999;">#아이유 #섭외 #대학축제</span></p>';
    expect(countHashtags(html)).toBe(3);
  });
});

import {
  checkTitle,
  bodyTextLength,
  countKeyword,
  bodyProseText,
  keywordDensity,
  countHashtagsWithKeyword,
  runPersonChecks,
} from '@/scripts/lib/article-checks.mjs';

// 2026-08-15 개정: 근거가 확인된 두 가지(인물명·섭외 포함)만 본다.
// 대괄호 형식과 길이 제한은 실측에서 순위와 무관해 풀었다.
describe('checkTitle', () => {
  it('accepts a bracketed title', () => {
    const t = '[아이유 섭외] 청량 보이스의 국민 가수, 대학 축제 및 브랜드 행사 섭외';
    expect(checkTitle(t, '아이유').ok).toBe(true);
  });

  it('accepts a title without brackets — real #1 posts mostly have none', () => {
    expect(checkTitle('걸그룹 레이샤 섭외 - 독보적인 퍼포먼스의 댄스팀', '레이샤').ok).toBe(true);
  });

  it('accepts a short title — length did not predict rank at all', () => {
    expect(checkTitle('[아이유 섭외]', '아이유').ok).toBe(true);
  });

  it('rejects a title with no 섭외', () => {
    const r = checkTitle('아이유 대학 축제 무대', '아이유');
    expect(r.ok).toBe(false);
    expect(r.hasKeyword).toBe(false);
  });

  it('rejects a title missing the person name', () => {
    const r = checkTitle('가수 섭외 대학 축제', '아이유');
    expect(r.ok).toBe(false);
    expect(r.hasName).toBe(false);
  });

  it('flags digits in the title without failing it', () => {
    expect(checkTitle('[아이유 섭외] 2026년 대학 축제', '아이유').hasDigit).toBe(true);
    expect(checkTitle('[아이유 섭외] 대학 축제', '아이유').hasDigit).toBe(false);
  });

  it('skips the name check when no person name is given', () => {
    expect(checkTitle('가수 섭외 안내').ok).toBe(true);
  });
});

describe('bodyTextLength', () => {
  it('counts non-space chars of stripped text', () => {
    expect(bodyTextLength('<p>가나다 라마</p>')).toBe(5);
  });
});

describe('countKeyword', () => {
  it('counts keyword occurrences', () => {
    expect(countKeyword('아이유 섭외는 좋다. 아이유 섭외 또.', '아이유 섭외')).toBe(2);
  });
});

describe('bodyProseText', () => {
  it('strips tags and hashtag tokens', () => {
    expect(bodyProseText('<p>가나다 라마</p><p>#섭외 #대학축제</p>')).toBe('가나다 라마');
  });
  it('drops script and style blocks', () => {
    expect(bodyProseText('<style>p{color:red}</style><script>var a=1</script><p>본문</p>')).toBe('본문');
  });
});

describe('keywordDensity', () => {
  // 1000자 본문에 "섭외" n회 → 밀도 n.0
  const prose = (chars: number, kw: number) =>
    `<p>${'가'.repeat(chars - kw * 2)}${'섭외'.repeat(kw)}</p>`;

  it('counts per 1000 chars of prose', () => {
    expect(keywordDensity(prose(1000, 4), '섭외')).toBeCloseTo(4.0, 5);
  });

  it('excludes hashtags from both numerator and denominator', () => {
    // 본문 1000자에 4회 + 해시태그에 10회 → 여전히 4.0
    const html = prose(1000, 4) + '<p>' + '#섭외태그 '.repeat(10) + '</p>';
    expect(keywordDensity(html, '섭외')).toBeCloseTo(4.0, 5);
  });

  it('returns 0 for empty html', () => {
    expect(keywordDensity('', '섭외')).toBe(0);
  });
});

describe('countHashtagsWithKeyword', () => {
  it('counts only hashtags containing the keyword', () => {
    const html = '<p>본문 섭외 이야기</p><p>#가수섭외 #대학축제 #섭외문의 #행사</p>';
    expect(countHashtagsWithKeyword(html, '섭외')).toBe(2);
  });
});

describe('runPersonChecks', () => {
  it('returns a fail finding when images != 4', () => {
    const html = '<p class="se-text-paragraph"><span>본문</span></p>';
    const findings = runPersonChecks(html, { title: '[아이유 섭외] 청량 보이스의 국민 가수, 대학 축제 섭외 행사' });
    const imgFinding = findings.find((f) => f.id === 'body_images');
    expect(imgFinding.level).toBe('fail');
  });

  const densityBody = (kw: number) => `<p class="se-text-paragraph"><span>${'가'.repeat(4000 - kw * 2)}${'섭외'.repeat(kw)}</span></p>`;

  // 밀도가 관문을 가른다(2026-09-05, 발행분 329편): 3.0 이하 노출률 41% vs 초과 20%, 4.0 초과 12%.
  // 경계 — 3.0 통과 / 3.25 경고 / 4.0 통과(경고) / 4.25 발행 불가
  it('does not complain about a density of 3.0 or below', () => {
    expect(runPersonChecks(densityBody(12)).find((f) => f.id === 'keyword_density')).toBeUndefined(); // 4000자에 12회 = 3.0
    expect(runPersonChecks(densityBody(8)).find((f) => f.id === 'keyword_density')).toBeUndefined();  // 2.0
  });

  it('warns above 3.0 but does not block up to 4.0', () => {
    expect(runPersonChecks(densityBody(13)).find((f) => f.id === 'keyword_density')?.level).toBe('warn'); // 3.25
    expect(runPersonChecks(densityBody(16)).find((f) => f.id === 'keyword_density')?.level).toBe('warn'); // 4.0
  });

  it('blocks a density above 4.0 — exposure falls to 12% there', () => {
    expect(runPersonChecks(densityBody(17)).find((f) => f.id === 'keyword_density')?.level).toBe('fail'); // 4.25
    expect(runPersonChecks(densityBody(40)).find((f) => f.id === 'keyword_density')?.level).toBe('fail'); // 10.0
  });

  // 카테고리 원고(`강연섭외` 등)는 키워드 자체에 섭외가 들어 있어 밀도가 높은 것이 정상 — 경고까지만.
  it('only warns a category article whose keyword itself contains 섭외', () => {
    const findings = runPersonChecks(densityBody(40), { personName: '강연섭외', title: '[강연섭외] 기업 행사 강연자 섭외 안내' });
    expect(findings.find((f) => f.id === 'keyword_density')?.level).toBe('warn');
  });

  it('fails when prose is shorter than 1500 chars', () => {
    const html = `<p class="se-text-paragraph"><span>${'가'.repeat(1200)}</span></p>`;
    expect(runPersonChecks(html).find((f) => f.id === 'prose_length')?.level).toBe('fail');
  });

  // 상위 노출 문서의 중앙값이 2,117자다. 그 대역이 막히면 안 된다.
  it('accepts a 2000-char article, which is where ranking posts actually sit', () => {
    const html = `<p class="se-text-paragraph"><span>${'가'.repeat(2000)}</span></p>`;
    expect(runPersonChecks(html).find((f) => f.id === 'prose_length')).toBeUndefined();
  });

  // 해시태그 규칙은 하위권이 오히려 더 잘 지켰다(상위 85% / 하위 100%). 막을 근거가 없다.
  it('only warns when more than 7 hashtags contain the keyword', () => {
    const html = densityBody(16) + '<p>' + '#가수섭외 '.repeat(8) + '</p>';
    expect(runPersonChecks(html).find((f) => f.id === 'hashtag_keyword')?.level).toBe('warn');
  });

  it('only warns when there are fewer than 20 hashtags', () => {
    expect(runPersonChecks(densityBody(8)).find((f) => f.id === 'hashtags')?.level).toBe('warn');
  });

  // 제목: 근거가 확인된 두 가지만 막는다
  it('fails a title with no 섭외', () => {
    const f = runPersonChecks(densityBody(8), { title: '아이유 대학 축제', personName: '아이유' });
    expect(f.find((x) => x.id === 'title_keyword')?.level).toBe('fail');
  });

  // 표기 변형(전진→[신화 섭외], 케이타이거즈→K타이거즈)에 오탐해서 경고까지만 한다
  it('only warns when the title lacks the literal person name', () => {
    const f = runPersonChecks(densityBody(8), { title: '가수 섭외 안내', personName: '아이유' });
    expect(f.find((x) => x.id === 'title_name')?.level).toBe('warn');
  });

  it('accepts an unbracketed title that names the person and 섭외', () => {
    const f = runPersonChecks(densityBody(8), { title: '걸그룹 레이샤 섭외 - 댄스팀', personName: '레이샤' });
    expect(f.find((x) => x.id?.startsWith('title'))).toBeUndefined();
  });

  it('fails when an image src is a Vercel Blob URL', () => {
    const html = densityBody(16) + IMG(`${BLOB}/iu/img1.jpg`);
    expect(runPersonChecks(html).find((f) => f.id === 'blob_image_src')?.level).toBe('fail');
  });

  it('does not flag blob_image_src when images live on Supabase', () => {
    const html = densityBody(16) + IMG(`${SUPA}/iu/img1.jpg`);
    expect(runPersonChecks(html).find((f) => f.id === 'blob_image_src')).toBeUndefined();
  });
});

import {
  tableItems,
  tableItemEchoes,
  proseSentences,
  duplicateSentencePairs,
} from '@/scripts/lib/article-checks.mjs';

const TABLE = `<table style="table-layout:fixed"><tbody><tr><th>대표곡</th>
  <td>'인생은 한번뿐', '한 잔 마시자'</td></tr><tr><th>출연</th>
  <td>'미스터트롯3', '불타는 트롯맨'</td></tr></tbody></table>`;
const P = (t: string) => `<p class="se-text-paragraph"><span>${t}</span></p>`;

describe('tableItems', () => {
  it('작은따옴표로 감싼 표 항목만 뽑는다', () => {
    expect(tableItems(TABLE).sort()).toEqual(
      ['인생은 한번뿐', '한 잔 마시자', '미스터트롯3', '불타는 트롯맨'].sort()
    );
  });
  it('표가 없으면 빈 배열', () => {
    expect(tableItems(P('표 없는 본문입니다'))).toEqual([]);
  });
});

describe('tableItemEchoes', () => {
  it('표 항목이 본문에 되풀이된 횟수를 센다', () => {
    const html = TABLE + P('미스터트롯3 출연 이후 미스터트롯3 무대가 화제였고 미스터트롯3 팬이 늘었습니다');
    const hit = tableItemEchoes(html, '강민수').find((e) => e.item === '미스터트롯3');
    expect(hit?.count).toBe(3);
  });
  it('표 안에서만 반복된 것은 세지 않는다', () => {
    expect(tableItemEchoes(TABLE, '강민수')).toEqual([]);
  });
  it('인물명과 겹치는 항목은 제외한다', () => {
    const html = `<table style="table-layout:fixed"><tr><td>'강민수'</td></tr></table>` +
      P('강민수 섭외는 강민수 무대를 원하는 행사에 맞습니다');
    expect(tableItemEchoes(html, '강민수')).toEqual([]);
  });
});

describe('proseSentences', () => {
  it('한국어 종결어미로 나누고 약어 마침표에서는 쪼개지 않는다', () => {
    const html = P('서커스 디 캬바레(Circus D. Cabaret)는 넌버벌 공연입니다. 무대는 60분 길이로 구성되며 관객 참여 순서가 중간에 들어갑니다.');
    expect(proseSentences(html).length).toBe(2);
  });
});

describe('duplicateSentencePairs', () => {
  it('같은 말을 두 번 한 문장쌍을 잡는다', () => {
    const html = P(
      '지역 축제와 기관 기념행사, 복지관 문화센터 실내 행사처럼 성인가요 레퍼토리가 맞는 자리에 적합합니다. ' +
      '섭외 문의는 오픈채팅으로 받습니다. ' +
      '지역 축제와 기관 기념행사, 복지관 문화센터 실내 행사가 대표적입니다.'
    );
    expect(duplicateSentencePairs(html).length).toBe(1);
  });
  it('서로 다른 문장만 있으면 빈 배열', () => {
    const html = P('첫 번째 문장은 데뷔 시점을 설명하는 서술입니다. 두 번째는 무대 구성과 진행 방식을 다룹니다.');
    expect(duplicateSentencePairs(html)).toEqual([]);
  });
});
