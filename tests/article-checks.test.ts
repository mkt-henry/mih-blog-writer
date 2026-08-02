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
} from '@/scripts/lib/article-checks.mjs';

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

describe('checkTitle', () => {
  it('accepts [이름 섭외] 30~60자 title', () => {
    const t = '[아이유 섭외] 청량 보이스의 국민 가수, 대학 축제 및 브랜드 행사 섭외';
    expect(checkTitle(t).ok).toBe(true);
  });
  it('rejects title without bracket', () => {
    expect(checkTitle('아이유 섭외 대학 축제').ok).toBe(false);
  });
  it('rejects too-short title', () => {
    expect(checkTitle('[아이유 섭외]').ok).toBe(false);
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

  // 밀도 경계 — 4.9 통과 / 5.0 통과 / 5.1 실패
  const densityBody = (kw: number) => `<p class="se-text-paragraph"><span>${'가'.repeat(4000 - kw * 2)}${'섭외'.repeat(kw)}</span></p>`;

  it('passes density at 5.0 per 1000 chars', () => {
    const findings = runPersonChecks(densityBody(20)); // 4000자에 20회 = 5.0
    expect(findings.find((f) => f.id === 'keyword_density' && f.level === 'fail')).toBeUndefined();
  });

  it('fails density above 5.0 per 1000 chars', () => {
    const findings = runPersonChecks(densityBody(21)); // 4000자에 21회 = 5.25
    expect(findings.find((f) => f.id === 'keyword_density')?.level).toBe('fail');
  });

  it('warns when density is below 3.0', () => {
    const findings = runPersonChecks(densityBody(8)); // 4000자에 8회 = 2.0
    expect(findings.find((f) => f.id === 'keyword_density')?.level).toBe('warn');
  });

  it('fails when prose is shorter than 3800 chars', () => {
    const html = `<p class="se-text-paragraph"><span>${'가'.repeat(3000)}</span></p>`;
    expect(runPersonChecks(html).find((f) => f.id === 'prose_length')?.level).toBe('fail');
  });

  it('fails when more than 7 hashtags contain the keyword', () => {
    const html = densityBody(16) + '<p>' + '#가수섭외 '.repeat(8) + '</p>';
    expect(runPersonChecks(html).find((f) => f.id === 'hashtag_keyword')?.level).toBe('fail');
  });
});
