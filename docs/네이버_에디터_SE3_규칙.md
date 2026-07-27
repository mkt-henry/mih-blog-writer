# 네이버 스마트에디터(SE3) HTML 복붙 규칙

> 네이버 블로그 글쓰기 화면에 **HTML 소스를 직접 붙여넣어** 포스팅할 때 지켜야 하는 규칙 모음.
> 일반 웹 HTML과 다르게, 네이버 에디터는 자체 클래스 기반으로 렌더링하므로 **인라인 스타일 일부가 무시**되고, 특정 클래스 구조가 없으면 서식이 깨진다.
> 아래는 실제 검증된 패턴만 담은 것이며, 그대로 복붙하면 SE3에서 안정적으로 렌더링된다.

---

## 0. 핵심 원리 (왜 이런 규칙이 필요한가)

- 네이버 스마트에디터(SE3)는 붙여넣은 HTML을 자체 컴포넌트로 재해석한다.
- **일반 `<p>본문</p>`은 깨진다.** 반드시 `se-text-paragraph` 클래스 구조를 써야 한다.
- 인라인 스타일 중 일부(정렬, 인용구 스타일 등)는 무시되고 SE3 기본값으로 렌더링된다.
- `data:image/...` 데이터 URI는 정책상 차단된다 → 반드시 외부 호스팅 URL 사용.
- 표는 `table-layout:fixed`가 없으면 셀 너비 선언을 무시하고 내용 길이 기준으로 자동 계산해 레이아웃이 깨진다.

---

## 1. 텍스트 단락 (가장 중요 — 일반 `<p>` 금지)

모든 본문 단락은 `se-text-paragraph` 클래스 구조를 쓴다.

```html
<!-- 좌측 정렬 -->
<p class="se-text-paragraph se-text-paragraph-align- " style="" id="SE-id"><span style="color:#444444;" class="se-fs- se-ff- ">본문 내용</span></p>

<!-- 가운데 정렬 -->
<p class="se-text-paragraph se-text-paragraph-align-center" style="" id="SE-id"><span style="color:#444444;" class="se-fs- se-ff- ">내용</span></p>
```

- `class="se-fs- se-ff- "` 의 뒤 공백까지 그대로 유지한다 (SE3가 폰트 크기/종류 슬롯으로 인식).
- `id`는 각 단락마다 고유하면 된다 (`SE-1`, `SE-2` 등 임의값 가능).

### 색상 규칙

| 용도 | 색상 | 클래스 |
|---|---|---|
| 일반 본문 | `#444444` | `se-fs- se-ff-` |
| 보조 설명 (박스 안 등) | `#555555` | |
| 캡션/출처 (작은 글씨 13px) | `#999999` | `se-fs-fs13 se-ff-` |
| 대제목 (30px, 검은색) | `#111111` | `<span style="font-size:30px; color:#111111;"><b>제목</b></span>` |

---

## 2. 대제목 (섹션 제목)

```html
<p id="SE-hN"><span style="font-size:30px; color:#111111;"><b>🎵 제목</b></span></p>
```

---

## 3. 인용구 (se-quotation-container) — 따옴표 스타일 고정

`se-quotation-container` + `se-quote` 조합은 **항상 따옴표(66/99) 장식 스타일**로 렌더링된다. 버티컬 라인 등 다른 인용 스타일은 에디터 UI에서만 선택 가능하며 HTML 직접 입력으로는 구현 불가.

```html
<blockquote class="se-quotation-container">
  <div class="se-module se-module-text se-quote"><!-- SE-TEXT { -->
    <p class="se-text-paragraph se-text-paragraph-align-center" style="" id="SE-q-1"><span style="color:#777777;" class="se-fs- se-ff- "><i>인용 내용</i></span></p><!-- } SE-TEXT -->
  </div>
</blockquote>
```

**주의:**
- 인용 텍스트에 `"` 따옴표 기호를 직접 넣지 않는다. SE3가 자동으로 장식 따옴표를 붙여 **두 번 표시**된다.
- 인용구를 **소제목 강조 용도로 쓰지 않는다** (따옴표 스타일로 고정되므로). 소제목 강조는 아래 4번을 쓴다.

---

## 4. 소제목 강조 박스 (인라인 스타일 `<p>`)

인용구를 소제목에 못 쓰므로, `<p>`에 인라인 스타일을 직접 준다.

```html
<!-- 왼쪽 세로선 강조 -->
<p class="se-text-paragraph se-text-paragraph-align- " style="border-left:4px solid #FF7043; background:#fff8f6; padding:12px 20px; margin:0;" id="SE-sub1"><span style="color:#333333;" class="se-fs- se-ff- "><b>① 소제목 내용</b></span></p>

<!-- 테두리 박스형 -->
<p class="se-text-paragraph se-text-paragraph-align- " style="border:2px solid #4A90D9; border-radius:8px; padding:12px 20px; margin:0;" id="SE-event1"><span style="color:#333333;" class="se-fs- se-ff- "><b>💼 소제목 내용</b></span></p>

<!-- 배경색 강조 박스 (여러 줄) -->
<p class="se-text-paragraph se-text-paragraph-align- " style="background:#e3f2fd; border-radius:8px; padding:16px 20px; margin:0;" id="SE-worry"><span style="color:#555555;" class="se-fs- se-ff- ">🔸 &nbsp;내용1<br>🔸 &nbsp;내용2</span></p>
```

---

## 5. 표(Table) — `table-layout:fixed` 필수

**모든 `<table>`에 `table-layout:fixed`를 넣지 않으면 레이아웃이 깨진다.** `table-layout:fixed` + **첫 행 각 셀의 `width:%` 명시** 조합이 유일한 안정적 해법이다.

```html
<!-- 2열 정보 표 (레이블:값) -->
<div align="center"><table style="border-collapse:collapse; width:100%; table-layout:fixed;">
<tr>
  <td style="background-color:#f5f5f5; padding:10px 16px; width:22%; font-weight:bold; color:#333333; border-bottom:1px solid #e8e8e8;">항목</td>
  <td style="padding:10px 16px; color:#444444; border-bottom:1px solid #e8e8e8;">내용</td>
</tr>
</table></div>

<!-- 헤더 행이 있는 표 -->
<div align="center"><table style="border-collapse:collapse; width:100%; table-layout:fixed;">
<tr style="background-color:#1565C0;">
  <td style="padding:10px 16px; color:#ffffff; font-weight:bold; width:30%;">열1</td>
  <td style="padding:10px 16px; color:#ffffff; font-weight:bold;">열2</td>
</tr>
</table></div>

<!-- 1열 세로선 강조 박스 -->
<div align="center"><table style="border-collapse:collapse; width:100%; table-layout:fixed;">
<tr>
  <td style="background-color:#e3f2fd; border-left:4px solid #1565C0; padding:14px 20px; border-bottom:1px solid #90caf9; color:#333333;"><b>① 소제목</b><br><span style="color:#666666; font-size:0.95em;">설명 문장</span></td>
</tr>
</table></div>
```

**열 너비 권장 비율:**
- 2열 레이블:값 표 → 레이블 **22%** : 값 78%
- 헤더 있는 2열 표 → 레이블 **28~32%** : 나머지
- 레이블 셀이 35%를 넘으면 가독성이 떨어진다.
- 1열 박스는 너비 명시 불필요 (`table-layout:fixed`만).

---

## 6. 이미지 삽입과 출처 표기

```html
<p align="center"><img src="[외부 호스팅 이미지 URL]" width="544"></p>
<p class="se-text-paragraph se-text-paragraph-align-center" style="" id="SE-src1"><span style="color:#999999;" class="se-fs-fs13 se-ff- ">출처 - OOO 공식 SNS</span></p>
```

- 본문 너비 기준 이미지 폭은 **544px**로 고정.
- `<img>` 바로 아래에 출처 캡션 `<p>`를 붙인다.
- ⚠️ **`data:image/...` 데이터 URI 금지** (네이버 정책 차단). 반드시 외부 URL.
- ⚠️ `image.png` 같은 상대경로/로컬 경로 금지 (깨짐).
- ⚠️ `📷 사진 N 삽입 위치` 같은 placeholder 텍스트 금지 → 실제 `<img>`를 넣는다.

---

## 7. 유튜브 영상 — iframe 임베드 (raw URL 금지)

```html
<p align="center"><iframe width="544" height="306" src="https://www.youtube.com/embed/VIDEO_ID" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></p>

<p><br></p>

<p align="center"><iframe width="544" height="306" src="https://www.youtube.com/embed/VIDEO_ID_2" frameborder="0" allowfullscreen></iframe></p>
```

- **`youtube.com/embed/VIDEO_ID` iframe 형식**만 사용. `watch?v=` / `youtu.be/` raw URL은 링크 텍스트로만 표시되므로 금지.
- `VIDEO_ID` = `https://www.youtube.com/watch?v=ABC123` 의 `?v=` 이후 값 (`ABC123`).
- 영상 사이에는 `<p><br></p>`.

---

## 8. 구분선

```html
<hr style="border:none; border-top:1px solid #e0e0e0; margin:20px 0;">
```

---

## 9. 텍스트 하이라이트(형광펜)

```html
<span style="background-color:#FFE0B2;">강조할 텍스트</span>
```

- 자주 쓰는 색: `#FFE0B2`(주황), `#bbdefb`(파랑)

---

## 10. 해시태그 단락

```html
<p class="se-text-paragraph se-text-paragraph-align- " style="" id="SE-hashtag"><span style="color:#999999;" class="se-fs-fs13 se-ff- ">#태그1 #태그2 #태그3</span></p>
```

- 좌측 정렬, 회색(`#999999`), 13px.

---

## 11. 줄바꿈 규칙 — 모바일 가독성 우선

네이버 블로그는 모바일 독자 비중이 높다. **문장이 끝나지 않아도** 호흡이 자연스러운 지점에서 적극적으로 `<br>`로 끊는다.

- 단락 사이 공백: `<p><br></p>` 1줄
- 같은 단락 내: 쉼표·연결어미 뒤, 주어·목적어 경계에서 `<br>`
- **문장 끝(`.` `?` `!`)에는 `<br><br>` 두 줄**로 한 줄 여백
- 줄 하나 목표 길이: 한글 약 20~35자, 40자 넘으면 중간에 `<br>`
- 5~10자 단위로 너무 잘게 끊지 않는다

**문장 끝 여백 자동 후처리 스크립트 (저장 직후 실행):**

```bash
node -e "
const fs = require('fs');
const p = process.argv[1];
let h = fs.readFileSync(p, 'utf8');
h = h.replace(/\.<br>(?!<br>)/g, '.<br><br>');
h = h.replace(/\?<br>(?!<br>)/g, '?<br><br>');
h = h.replace(/!<br>(?!<br>)/g, '!<br><br>');
fs.writeFileSync(p, h, 'utf8');
console.log('sentence spacing applied');
" '<파일경로>.html'
```

---

## 12. 절대 금지 (SE3 렌더링 깨짐 유발)

1. 일반 `<p>본문</p>` — 반드시 `se-text-paragraph` 구조
2. `<table>`에 `table-layout:fixed` 누락
3. `se-quotation-container`를 소제목 강조에 사용
4. 인용구 텍스트에 `"` 따옴표 직접 추가 (중복 렌더)
5. `data:image/...` 데이터 URI
6. 유튜브 raw URL(`watch?v=`, `youtu.be/`)
7. `📷 사진 N 삽입 위치` placeholder 텍스트
8. 상대경로/로컬 이미지 경로(`image.png` 등)

---

## 13. 기계 검증 로직 (참고 — 정규식으로 자동 점검)

붙여넣기 전 HTML을 자동 검사할 때 쓸 수 있는 판정 기준. (아래는 이 프로젝트 검증기의 핵심 항목이며, 개수 기준은 프로젝트 정책에 맞게 조정)

| 항목 | 판정 정규식/기준 |
|---|---|
| 일반 `<p>` 검출 | `<p>` 블록 중 `se-text-paragraph` 없고, `<img>`/빈줄/`SE-h`(대제목)도 아닌데 텍스트가 있으면 위반 |
| 표 레이아웃 | `<table>` 태그에 `table-layout\s*:\s*fixed` 없으면 위반 |
| 유튜브 iframe | `<iframe ... youtube(-nocookie)?\.com/embed/ ...>` 개수 |
| 유튜브 raw URL | `youtube\.com/watch\?v=` \| `youtu\.be/` 검출 시 위반 |
| 깨지는 이미지 | `<img src="data:image/` 또는 `image.png` 검출 시 위반 |
| 데이터 URI | `data:image/` 검출 시 위반 |
| placeholder | `📷\s*사진\s*\d+\s*삽입\s*위치` 검출 시 위반 |
| 이미지 출처 캡션 | `출처\s*-\s*[^<]*?공식\s*(?:SNS|자료)` 개수 |
| 해시태그 개수 | 태그 제거 후 텍스트에서 `#[^\s#<]+` 개수 |
| 본문 글자수 | 태그·`&nbsp;` 제거 후 공백 제외 길이 |

---

## 14. 이 프로젝트(mih) 고유 정책 — 참고용 (다른 프로젝트에선 조정)

> 아래는 네이버 에디터 규칙이 아니라 **원고 콘텐츠 정책**이다. 이식 시 새 프로젝트 기준으로 바꾼다.

- 본문 이미지 `<img>` **정확히 4개** + 출처 캡션 4개
- 유튜브 iframe **정확히 2개**
- 해시태그 **20개 이상**
- 본문 글자수 **2,000~3,000자**
- 제목 형식 `[OOO 섭외] ...` 30~60자
- 메인 키워드 밀도 10~20회
- 명함 이미지는 본문에 넣지 않음(모아보기가 자동 합성)
- 카카오 오픈채팅 단일 URL 고정
