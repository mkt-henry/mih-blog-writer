import { describe, it, expect } from 'vitest';
import { toMobileUrl, extractPostText, extractTitle } from '@/scripts/lib/naver-post.mjs';

const FILLER = '프로야구 탄생 과정을 다룬 취재파일 본문입니다. '.repeat(12); // 200자 하한 넘기기
const END = '<div class="area_sympathy">공감 12</div><div class="wrap_postcomment">댓글 3</div>';

describe('toMobileUrl', () => {
  it('일반 블로그 URL을 모바일 PostView로 바꾼다', () => {
    expect(toMobileUrl('https://blog.naver.com/yment3/224368599545')?.url)
      .toBe('https://m.blog.naver.com/PostView.naver?blogId=yment3&logNo=224368599545');
  });
  it('이미 쿼리 형태인 URL도 처리한다', () => {
    const r = toMobileUrl('https://blog.naver.com/PostView.naver?blogId=abc&logNo=123');
    expect([r?.blogId, r?.logNo]).toEqual(['abc', '123']);
  });
  it('블로그 글이 아니면 null', () => {
    expect(toMobileUrl('https://example.com')).toBeNull();
  });
});

describe('extractPostText — 마크업 세대별', () => {
  // 오래된 글일수록 오래된 마크업이다. 한 세대라도 빠지면 데이터셋이 최신 글로 치우친다.
  const cases: [string, string][] = [
    ['SE3', `<div class="se-main-container">${FILLER}</div>`],
    ['SE2', `<div class="se_component_wrap">${FILLER}</div>`],
    ['구 에디터', `<div class="post_ct  " id="viewTypeSelector">${FILLER}</div>`],
    ['최고참', `<div id="postViewArea">${FILLER}</div>`],
  ];
  for (const [name, html] of cases) {
    it(`${name} 본문을 뽑는다`, () => {
      expect(extractPostText(html)?.length).toBeGreaterThan(200);
    });
  }

  it('공감·댓글 영역은 본문에서 잘라낸다', () => {
    const text = extractPostText(`<div class="se-main-container">${FILLER}</div>${END}`)!;
    expect(text).not.toContain('공감');
    expect(text).not.toContain('댓글');
  });

  it('스크립트 안의 se-main-container 문자열에 속지 않는다', () => {
    // 실제 사고: 지연로딩 스크립트가 ".se-main-container" 를 문자열로 갖고 있어
    // 컨테이너를 찾은 줄 알고 엉뚱한 위치부터 잘랐다.
    const html = `<script>new ImageLazyLoader(".se-main-container")</script>` +
      `<div class="post_ct" id="viewTypeSelector">${FILLER}</div>`;
    expect(extractPostText(html)).toContain('프로야구');
  });

  it('컨테이너가 없으면 페이지 전체를 본문으로 쓰지 않고 null', () => {
    expect(extractPostText(`<div class="header">이웃추가 안부글 작성횟수 블로그 마켓</div>`)).toBeNull();
  });

  it('본문이 200자 미만이면 버린다', () => {
    expect(extractPostText('<div class="se-main-container">짧은 글</div>')).toBeNull();
  });
});

describe('extractTitle', () => {
  it('og:title을 우선한다', () => {
    const html = '<meta property="og:title" content="[최예나 섭외] 행사"><title>네이버 블로그</title>';
    expect(extractTitle(html)).toBe('[최예나 섭외] 행사');
  });
});
