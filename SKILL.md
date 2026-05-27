---
name: naver-blog-editor
description: 네이버 스마트에디터(SE3) HTML 복붙용 원고 작성 스킬. 네이버 블로그에 HTML 소스를 직접 붙여넣기 방식으로 포스팅할 때 사용. 인용구(se-quotation-container), 텍스트 단락(se-text-paragraph), 소제목 강조 박스, 구분선, 이미지 출처 표기, 유튜브 삽입 등 SE 호환 HTML 구조 작성 시 반드시 이 스킬을 참고할 것.
---

# 네이버 블로그 에디터 HTML 작성 스킬

## 핵심 원칙

네이버 스마트에디터(SE3)는 자체 클래스 기반으로 렌더링되므로, HTML 직접 입력 시 **인라인 스타일 일부가 무시**된다. 아래 검증된 패턴만 사용할 것.

---

## 1. 텍스트 단락

```html
<!-- 좌측 정렬 -->
<p class="se-text-paragraph se-text-paragraph-align- " style="" id="SE-id"><span style="color:#444444;" class="se-fs- se-ff- ">본문 내용</span></p>

<!-- 가운데 정렬 -->
<p class="se-text-paragraph se-text-paragraph-align-center" style="" id="SE-id"><span style="color:#444444;" class="se-fs- se-ff- ">내용</span></p>
```

**색상 규칙:**
- 일반 본문: `color:#444444`
- 보조 설명: `color:#555555`
- 캡션/출처 (작은 글씨): `color:#999999; class="se-fs-fs13 se-ff- "`
- 헤더(30px, 검은색): `<span style="font-size:30px; color:#111111;"><b>제목</b></span>`

---

## 2. 인용구 (se-quotation-container)

`se-quotation-container` + `se-quote` 조합은 **항상 따옴표(66/99) 스타일**로 렌더링된다. 버티컬 라인 등 다른 스타일은 에디터 UI에서만 선택 가능하며, HTML 직접 입력으로는 구현 불가.

```html
<blockquote class="se-quotation-container">
  <div class="se-module se-module-text se-quote"><!-- SE-TEXT { -->
    <p class="se-text-paragraph se-text-paragraph-align-center" style="" id="SE-q-1"><span style="color:#777777;" class="se-fs- se-ff- "><i>인용 내용</i></span></p><!-- } SE-TEXT -->
  </div>
</blockquote>
```

**주의:** HTML에 `"` 따옴표 기호를 직접 추가하면 SE 자동 렌더링 장식 따옴표와 **중복**되어 두 번 표시됨. 텍스트 내 따옴표 기호 추가 금지.

---

## 3. 소제목 강조 박스 (인라인 스타일 p 태그)

`se-quotation-container`는 소제목 강조에 사용 불가 (따옴표 스타일로 고정 렌더링됨). 대신 `<p>` 태그에 인라인 스타일 적용.

```html
<!-- 왼쪽 세로선 강조 (소제목 ①②③ 등) -->
<p class="se-text-paragraph se-text-paragraph-align- " style="border-left:4px solid #FF7043; background:#fff8f6; padding:12px 20px; margin:0;" id="SE-sub1"><span style="color:#333333;" class="se-fs- se-ff- "><b>① 소제목 내용</b></span></p>

<!-- 테두리 박스형 (행사 유형, 카테고리 소제목) -->
<p class="se-text-paragraph se-text-paragraph-align- " style="border:2px solid #4A90D9; border-radius:8px; padding:12px 20px; margin:0;" id="SE-event1"><span style="color:#333333;" class="se-fs- se-ff- "><b>💼 소제목 내용</b></span></p>
```

---

## 4. 구분선

```html
<hr style="border:none; border-top:1px solid #e0e0e0; margin:20px 0;">
```

---

## 5. 이미지 삽입과 출처 표기

```html
<p align="center"><img src="[공식 이미지 URL 또는 업로드 후 Vercel Blob URL]" width="544"></p>
<p class="se-text-paragraph se-text-paragraph-align-center" style="" id="SE-src1"><span style="color:#999999;" class="se-fs-fs13 se-ff- ">출처 - [아티스트명] 공식 SNS</span></p>
```

인물 원고는 실제 본문 이미지 `<img>` 4개와 출처 표기 4개를 한 세트로 넣는다. 출처 표기는 본문 근거 출처가 아니라 바로 위 이미지의 출처를 뜻한다. `📷 사진 N 삽입 위치` 같은 placeholder 텍스트는 넣지 않는다.

- 이미지 src는 자료 수집 단계에서 확보한 공식 SNS, 아티스트 공식 홈페이지, 소속사 공식 프로필 페이지 이미지 URL을 먼저 넣고, 저장 후 `scripts/upload-article-images.js`로 Vercel Blob URL로 교체한다.
- 보도자료, 언론 기사, 방송사 기사, 방송 캡처, 팬 계정, 커뮤니티, 이미지 검색 썸네일은 인물 원고 이미지로 사용하지 않는다.
- 공식 SNS 이미지는 `출처 - [아티스트명] 공식 SNS`, 소속사/공식 프로필 페이지 이미지는 `출처 - [아티스트명] 공식 자료`로 표기한다.
- 출처 표기만 있고 실제 `<img>`가 없는 인물 원고는 실패다.
- 명함 이미지와 본문 이미지를 혼동하지 않는다. 명함 이미지는 원고에 직접 넣지 않는다.

---

## 6. 유튜브 영상 삽입

모든 원고의 유튜브 영상 URL은 **항상 정확히 2개**를 넣는다.
실제 존재를 확인한 영상을 iframe 임베드(`youtube.com/embed/<VIDEO_ID>`)로 정확히 2개 배치한다. raw `watch?v=` URL은 쓰지 않는다.
단, 블로그 본문에는 `iframe`, `raw URL`, `스마트에디터 호환`, `원본 URL만 남깁니다` 같은 발행자용 기술 설명을 쓰지 않는다.
0개, 1개, 3개 이상은 검수 실패로 본다.

```html
<iframe width="544" height="306" src="https://www.youtube.com/embed/VIDEO_ID_1" frameborder="0" allowfullscreen></iframe>

<p><br></p>

<iframe width="544" height="306" src="https://www.youtube.com/embed/VIDEO_ID_2" frameborder="0" allowfullscreen></iframe>
```

---

## 7. 명함 이미지

**원고 본문에 명함 `<img>` 태그를 직접 넣지 않는다.** 모아보기(`output/index.html`)가 발행 계정의 명함을 카카오 링크가 들어 있는 `<p>` 직전에 자동으로 합성한다. 본문에 직접 넣으면 중복된다.

명함 이미지 URL과 클릭 링크는 `scripts/build-manifest.js` 상단의 `AGENCIES` / `BUSINESS_CARD_LINK_URL` 상수에서 관리한다 — 변경 시 그 파일을 수정하고 `npm run build` 를 다시 실행한다. 상대 경로나 `data:image` URI는 어떤 경우에도 사용하지 않는다.

---

## 8. 텍스트 하이라이트

```html
<span style="background-color:#FFE0B2;">강조할 텍스트</span>
```

---

## 9. 해시태그

좌측 정렬, 작은 회색 폰트.

```html
<p class="se-text-paragraph se-text-paragraph-align- " style="" id="SE-hashtag"><span style="color:#999999;" class="se-fs-fs13 se-ff- ">#태그1 #태그2 #태그3</span></p>
```

---

## 10. 전체 문서 구조 예시

전체 원고 예시는 `references/full-example.html` 참고.
