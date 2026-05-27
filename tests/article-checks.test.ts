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
});

describe('countHashtags', () => {
  it('counts # tokens', () => {
    expect(countHashtags('#가수 #섭외 #공연')).toBe(3);
  });
});

import {
  checkTitle,
  bodyTextLength,
  countKeyword,
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

describe('runPersonChecks', () => {
  it('returns a fail finding when images != 4', () => {
    const html = '<p class="se-text-paragraph"><span>본문</span></p>';
    const findings = runPersonChecks(html, { title: '[아이유 섭외] 청량 보이스의 국민 가수, 대학 축제 섭외 행사' });
    const imgFinding = findings.find((f) => f.id === 'body_images');
    expect(imgFinding.level).toBe('fail');
  });
});
