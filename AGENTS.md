# 프로젝트 개요

**메이드인헤븐 에이전시**의 네이버 블로그 연예인 섭외 원고를 자동 생성하는 프로젝트다.
모든 결과물은 **네이버 스마트에디터(SE3) HTML 복붙용**으로 출력되며, 네이버 검색 **상위 노출(C-Rank · D.I.A.+)** 을 목표로 한다.

이 저장소는 **로컬 도구**다. 외부 서비스(데이터베이스·API·배포 사이트)에 의존하지 않는다.
원고는 `output/` 폴더에 HTML 파일로 저장되고, 모아보기(`output/index.html`)를 브라우저로 열면 발행 계정별로 정리된 원고를 미리보기·복사할 수 있다.

---

# 디렉토리 구조

```
mih-blog-writer/
├── output/
│   ├── index.html              ← 모아보기 (브라우저로 열어서 사용)
│   ├── manifest.js             ← 자동 생성: npm run build로 갱신
│   └── YYYY-MM-DD/{agency_slug}/[slug]_[제목].html
├── docs/
│   ├── 지침/                   ← 4개 분기 지침 (먼저 00_개요.md 참고)
│   └── 네이버_블로그_상위_노출_전략.md
├── scripts/build-manifest.js   ← output/ 스캔 → manifest.js 생성
├── AGENTS.md                   ← 이 문서: 공통 규칙
├── SKILL.md                    ← SE3 HTML 컴포넌트 패턴
└── package.json                ← npm run build / npm run dev
```

---

# 워크플로우 (새 원고 요청 시)

1. **분기 판단** — 사용자 요청이 인물 1명 섭외인지, 카테고리 키워드 원고인지 결정한다. 헷갈리면 `docs/지침/00_개요.md`를 본다.
2. **발행 계정 결정** — 사용자가 명시하지 않았으면 `mih_speaker` / `mih_casting` / `mih_agency` 중 어디에 올릴지 먼저 확인한다.
3. **자료 조사 및 작성**
   - 인물 원고: `01_자료_수집_지침.md` → `02_원고_작성_지침.md`
   - 카테고리 원고: `04_카테고리_키워드_원고_작성_지침.md` (자료 조사 절차 포함)
4. `output/YYYY-MM-DD/{agency_slug}/[slug]_[제목].html`로 저장한다.
5. 문장 끝 여백 후처리 스크립트를 실행한다 (아래 "줄바꿈 규칙" 섹션 참고).
6. `03_원고_검토_지침.md`로 검토하고 통과시킨다.
7. **`npm run build`** 를 실행해 `output/manifest.js`를 갱신한다 — 이걸 안 돌리면 모아보기에 새 원고가 안 보인다.
8. 글자수와 메인 키워드 등장 횟수를 사용자에게 리포트한다.

---

# 출력 파일명 규칙

```
output/YYYY-MM-DD/{agency_slug}/[slug]_[원고제목].html
```

- `{agency_slug}`: `mih_speaker` (스피커), `mih_casting` (캐스팅), `mih_agency` (에이전시), `mih_history` (이전 발행 원고)
- `[slug]`: 인물 원고는 아티스트명, 카테고리 원고는 메인 키워드
- `[원고제목]`: 본문에 사용한 **최종 확정 제목 전체**(대괄호 포함)
- Windows 금지 문자(`\ / : * ? " < > |`)는 공백 또는 `-` 로 치환 (대괄호 `[]`, 쉼표 `,` 는 그대로 유지)
- 예: `output/2026-05-08/mih_speaker/김미경_[김미경 섭외] 대한민국 대표 자기계발 강사, 기업 특강·여성 리더십·AI 강연 섭외.html`

루트, `output/` 바로 아래, 날짜 폴더 바로 아래에는 절대 저장하지 않는다 — agency 서브폴더가 없으면 모아보기에서 안 보인다.

---

# 모아보기 사용법 (사용자용)

1. (새 원고를 추가했다면) 터미널에서 `npm run build`
2. 파일 탐색기에서 `output/index.html` 더블클릭하거나, `npm run dev` 후 브라우저로 접속
3. 좌측 상단 탭에서 **발행 계정** 선택 (스피커/캐스팅/에이전시/이전 발행)
4. 좌측 목록에서 원고 클릭 → 우측에 그 계정의 명함이 합성된 미리보기가 표시됨
5. 우측 상단 **제목 복사** → 원고 제목이 클립보드에 복사됨. 네이버 블로그 글쓰기 페이지의 제목 입력란에 붙여넣는다.
6. **콘텐츠 복사** → 명함 포함 HTML이 클립보드에 복사됨. 네이버 블로그 글쓰기 페이지의 HTML 모드에 붙여넣고 발행한다.

---

# 사실 확인 원칙 (인물 원고 한정 — 최우선 규칙)

> 카테고리 키워드 원고의 자료 조사 규칙은 `04_카테고리_키워드_원고_작성_지침.md`에 따로 있다. 이 섹션은 인물 원고에만 적용된다.

**학습 데이터에 의존해 프로필 정보를 쓰지 않는다.** 연예인/MC의 소속사·데뷔·수상·출연작·성대모사 레퍼토리·팬덤 등 **모든 프로필 사실은 반드시 웹 검색으로 1차 확인한 뒤 작성한다.** 학습 데이터는 오래됐거나 완전히 틀렸을 수 있으며(예: KBS/MBC 공채 혼동, 소속사 이적 누락), 한 번의 오류가 블로그 신뢰도와 C-Rank 전체에 악영향을 준다.

## 필수 절차

1. **WebSearch를 최소 5회 이상 호출한다** — 검색 각도를 다양하게 분산해야 한다:
   - `"[아티스트명] 프로필 데뷔 소속사"`
   - `"[아티스트명] 최근 활동 [현재연도]"` — 반드시 현재 연도(2026) 포함
   - `"[아티스트명] 수상 내역 [현재연도]"`
   - `"[아티스트명] 뮤직비디오 유튜브 official"` (또는 강연자면 `"[이름] 유튜브 강연 영상"`)
   - `"[아티스트명] 최신 뉴스 OR 컴백 OR 활동"` — 최근 이슈·변동 사항 파악용
   - 필요시 추가: 소속사 이적·군입대·활동 중단 등 상태 변화 관련 검색
2. 공식/위키 레벨 소스(위키백과, 나무위키, 공식 소속사 페이지, 언론 기사)를 **WebFetch로 직접 확인** — 최소 1개 이상.
3. 교차 검증: 2개 이상의 출처에서 일치하는 정보만 원고에 반영.
4. 단일 출처에서만 확인되거나 출처 간 상충하는 정보는 **일반화된 표현**으로 처리한다 ("다수의 예능 프로그램 출연" 등).
5. 유튜브 URL도 검색으로 실제 존재하는 영상을 확인해 넣는다 — 플레이스홀더/주석 처리 금지.
6. 모든 원고의 유튜브 URL은 **항상 정확히 2개**여야 한다.

## 사실 확인 체크리스트 (원고 저장 전)

- [ ] 데뷔 연도/경로를 웹 검색으로 확인했는가
- [ ] 현재 소속사를 웹 검색으로 확인했는가
- [ ] 출연 프로그램 목록이 현재 시점 기준 실제 방영 이력이 있는가
- [ ] 수상 내역이 실제 수상 기록인가 (창작 금지)
- [ ] 성대모사/특기 등 구체 항목이 실제 공개 발언/방송에서 확인된 내용인가
- [ ] 유튜브 URL이 실제 존재하는 영상 ID인가
- [ ] 유튜브 URL이 정확히 2개인가

---

# 공통 규칙 (분기 무관)

## A. SEO 전략 (인물 원고 기준 — 카테고리는 04 참고)

### 제목
- **형식:** `[아티스트명 섭외] + 핵심 매력 수식어 + 타겟 행사 2~3개`
- 30~60자 권장
- 핵심 키워드는 반드시 **대괄호 `[]`** 로 맨 앞에 배치
- 예: `[투어스 섭외] 청량 에너지 보이후드 팝, 대학 축제 및 브랜드 팝업 섭외`

### 본문 구조 (2,000~2,800자 권장, 최대 3,000자)

분량보다 **정보 밀도와 가독성이 우선**이다. 2,500자를 넘기면 프로필 표와 본문 중복부터 덜어낸다.

1. **도입부(300~500자)** — AEO 정답 노드: 누구이고, 어떤 행사에 최적이며, 섭외 경로는 어디인지를 압축 제시
2. **아티스트 소개** — 프로필 표 포함
3. **무대 방향 3가지** — 왼쪽 세로선 박스 ①②③
4. **적합 행사 유형 4종** — 2열 표(행사 유형 / 잘 맞는 이유)
5. **섭외 전 확인 포인트 3가지** — 왼쪽 세로선 박스 ①②③
6. **무대 영상** — 유튜브 URL 항상 정확히 2개 (raw URL, iframe 아님)
7. **섭외 절차 안내** — HYBE 등 대형 기획사는 직접 접근 어려움 강조
8. **마무리 CTA** — 카카오톡 오픈채팅 링크 (명함은 모아보기가 자동 합성하므로 본문에 넣지 않는다)
9. **해시태그 단락** — 20개 이상
10. **이미지 출처 표기** — 본문 전체에 정확히 4개 고정

### 태그
- 10~17개 범위 (해시태그 단락과 별개)
- 3단 구성: 핵심 키워드(아티스트명, 아티스트명+섭외) / 행사 유형 / 연관 키워드(장르·소속사·수상)

### 키워드 밀도
- 메인 키워드(아티스트명+섭외)를 본문 전체에 **10~20회** 자연스럽게 분산
- 억지 반복 금지 — 어뷰징으로 판정됨

## B. HTML 작성 규칙 (`SKILL.md`도 함께 참고)

**모든 텍스트 단락은 반드시 SE3 클래스 구조를 사용한다.** 일반 `<p>태그</p>`로 쓰면 네이버 에디터에서 깨진다.

### 필수 HTML 패턴

```html
<!-- 본문 좌측 정렬 -->
<p class="se-text-paragraph se-text-paragraph-align- " style="" id="SE-xxx"><span style="color:#444444;" class="se-fs- se-ff- ">본문</span></p>

<!-- 가운데 정렬 -->
<p class="se-text-paragraph se-text-paragraph-align-center" style="" id="SE-xxx"><span style="color:#444444;" class="se-fs- se-ff- ">본문</span></p>

<!-- 대제목 (30px, 검은색) -->
<p id="SE-hN"><span style="font-size:30px; color:#111111;"><b>🎵 제목</b></span></p>

<!-- 인용구 (따옴표 스타일 고정) — 도입부/핵심 메시지/마무리에만 -->
<blockquote class="se-quotation-container">
  <div class="se-module se-module-text se-quote"><!-- SE-TEXT { -->
    <p class="se-text-paragraph se-text-paragraph-align-center" style="" id="SE-q1"><span style="color:#777777;" class="se-fs- se-ff- "><i>인용 내용</i></span></p><!-- } SE-TEXT -->
  </div>
</blockquote>

<!-- 고민 공감 박스 (파란 배경) -->
<p class="se-text-paragraph se-text-paragraph-align- " style="background:#e3f2fd; border-radius:8px; padding:16px 20px; margin:0;" id="SE-worry"><span style="color:#555555;" class="se-fs- se-ff- ">🔸 &nbsp;질문1<br>🔸 &nbsp;질문2</span></p>

<!-- 구분선 -->
<hr style="border:none; border-top:1px solid #e0e0e0; margin:20px 0;">

<!-- 이미지 출처 표기 (가운데 정렬, 회색, 13px) -->
<p class="se-text-paragraph se-text-paragraph-align-center" style="" id="SE-srcN"><span style="color:#999999;" class="se-fs-fs13 se-ff- ">출처 - [아티스트명] 공식 SNS</span></p>

<!-- 유튜브 — raw URL만 붙이기 (iframe 사용 시 504 케이스 많음) -->
https://www.youtube.com/watch?v=VIDEO_ID_1

<p><br></p>

https://www.youtube.com/watch?v=VIDEO_ID_2

<!-- 해시태그 단락 (좌측 정렬, 회색, 13px) -->
<p class="se-text-paragraph se-text-paragraph-align- " style="" id="SE-hashtag"><span style="color:#999999;" class="se-fs-fs13 se-ff- ">#태그1 #태그2 ...</span></p>
```

### CTA / 명함 / 카카오 링크 규칙

- **명함 이미지(`<img src=...agency-card>`)는 원고 본문에 포함하지 않는다.** 모아보기가 발행 계정의 명함을 카카오 링크 직전에 자동 삽입한다. 본문에 직접 넣으면 중복된다.
- **카카오톡 오픈채팅 URL은 모든 계정 공통 단일 값**: `https://open.kakao.com/o/squEahWg`. 다른 카카오 URL 절대 사용 금지.
- 명함 또는 카카오 URL을 변경해야 하면 `scripts/build-manifest.js` 상단의 `AGENCIES` / `KAKAO_URL` 상수를 수정 → `npm run build` 다시 실행.
- ⚠️ `data:image/...` 데이터 URI는 네이버 에디터 정책상 차단되므로 절대 사용 금지.

### 표(Table) — 시각적 통일성 유지

**⚠️ 모든 `<table>`에 `table-layout:fixed` 필수.** 없으면 네이버 에디터가 셀 너비 선언을 무시하고 콘텐츠 길이 기준으로 자동 계산해서 레이아웃이 깨진다. `table-layout:fixed` + **첫 행 각 셀의 `width:%` 명시** 조합이 유일한 안정적 해법이다.

```html
<!-- 프로필/정보 표 (좌측 레이블 회색 배경) — 22% : 78% -->
<div align="center"><table style="border-collapse:collapse; width:100%; table-layout:fixed;">
<tr>
  <td style="background-color:#f5f5f5; padding:10px 16px; width:22%; font-weight:bold; color:#333333; border-bottom:1px solid #e8e8e8;">항목</td>
  <td style="padding:10px 16px; color:#444444; border-bottom:1px solid #e8e8e8;">내용</td>
</tr>
</table></div>

<!-- 헤더 행이 있는 표 (행사 유형 표 등) — 28~32% : 나머지 -->
<div align="center"><table style="border-collapse:collapse; width:100%; table-layout:fixed;">
<tr style="background-color:#1565C0;">
  <td style="padding:10px 16px; color:#ffffff; font-weight:bold; width:30%;">열1</td>
  <td style="padding:10px 16px; color:#ffffff; font-weight:bold;">열2</td>
</tr>
</table></div>

<!-- 왼쪽 세로선 강조 박스 (1열, 소제목 ①②③용) -->
<div align="center"><table style="border-collapse:collapse; width:100%; table-layout:fixed;">
<tr>
  <td style="background-color:#e3f2fd; border-left:4px solid #1565C0; padding:14px 20px; border-bottom:1px solid #90caf9; color:#333333;"><b>① 소제목</b><br><span style="color:#666666; font-size:0.95em;">설명 문장</span></td>
</tr>
</table></div>
```

**열 너비 권장 비율:**
- **프로필 표 (2열)**: 레이블 **22%** : 값 78%
- **행사 유형 표 (2열 + 헤더)**: 레이블 **28~32%** : 설명 72~68%
- **1열 세로선 박스**: 단일 셀이므로 너비 명시 불필요 (table-layout:fixed만)
- 레이블 셀 비율이 35%를 넘어가면 가독성이 떨어지므로 피한다.

### 색상 규칙

| 용도 | 색상 | 비고 |
|---|---|---|
| 일반 본문 | `#444444` | `se-fs- se-ff-` |
| 보조 설명 | `#555555` | 박스 안 등 |
| 캡션/출처 | `#999999` | `se-fs-fs13 se-ff-` (13px) |
| 소제목 박스 본문 | `#333333` | |
| 대제목 | `#111111` | 30px, `<b>` |
| 인용구 본문 | `#777777` | `<i>` 기울임 |
| 형광펜(하이라이트) | `background-color:#bbdefb` 또는 `#FFE0B2` | |

### 줄바꿈 규칙 — **모바일 가독성 우선**

네이버 블로그는 모바일 독자 비중이 높다. **문장이 끝나지 않아도** 호흡이 자연스러운 지점에서 적극적으로 `<br>`로 끊는다.

- 단락 사이 공백은 `<p><br></p>` 1줄
- 같은 단락 내에서는 쉼표·연결어미 뒤, 주어·목적어 경계 등에서 `<br>` 삽입
- **문장 끝(`.` `?` `!`)에는 반드시 `<br><br>` 두 줄**로 한 줄 여백 추가
- 줄 하나의 목표 길이: 한글 기준 약 20~35자
- 한 문장이 40자를 넘으면 중간에 `<br>`로 끊는다
- 박스·강조 박스·소개 본문도 동일 규칙 적용
- 5~10자 단위로 너무 잘게 끊지 말 것

**자동 후처리 (저장 직후 실행):**

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
" 'output/<경로>/<파일명>.html'
```

**예시 (권장 ✅):**
```html
<span>허성범은 카이스트 전산학부를 졸업하고<br>현재 AI 대학원에 재학 중인 연구자 겸 방송인이에요.<br><br>쿠팡플레이 《대학 전쟁》에서 카이스트 팀으로 활약하며<br>대중에게 존재감을 알렸어요.</span>
```

## C. 절대 금지

1. **`📷 사진 N 삽입 위치` placeholder 텍스트 금지** — 출처 표기만 남긴다 (`출처 - [아티스트명] 공식 SNS`).
2. **인용구(`se-quotation-container`)를 소제목 강조에 사용 금지** — 따옴표 스타일로 고정 렌더링됨.
3. **인용구 텍스트에 `"` 따옴표 직접 추가 금지** — SE가 자동으로 장식 따옴표를 붙여 중복된다.
4. **일반 `<p>` 태그로 본문 작성 금지** — 반드시 `se-text-paragraph` 클래스 구조 사용.
5. **반복 표현 금지** — 섹션 도입부 상투어, 표 ↔ 본문 동일 문장, 유사 수식어 반복.
5-1. **프로필 표 ↔ 본문 중복 금지** — 표에 있는 수상·저서·출연작 리스트를 본문에서 다시 열거하지 않는다. 본문은 일반화하고 상세는 표가 담당한다.
6. **단순 bullet 리스트(`<ul><li>`) 지양** — 표·소제목 박스로 대체.
7. **출처 불명 사실 단정 금지** — 확실하지 않으면 일반화하거나 생략.
8. **학습 데이터만으로 프로필 작성 금지** — 반드시 WebSearch/WebFetch로 1차 확인 후 작성.
9. **명함 `<img>` 태그를 원고에 직접 넣지 않는다** — 모아보기가 자동 합성한다.
10. **카카오 URL은 `https://open.kakao.com/o/squEahWg` 만 사용**.

---

# 발행 전 체크리스트 (자가 검증 — 인물 원고 기준)

> 카테고리 원고의 체크리스트는 `04_카테고리_키워드_원고_작성_지침.md` 끝부분 참고.

- [ ] 제목: `[아티스트명 섭외]` 대괄호 + 수식어 + 행사 유형 2~3개, 30~60자
- [ ] 본문 텍스트 2,000~2,800자
- [ ] 프로필 표 ↔ 본문 중복 없음
- [ ] 모든 문장 끝에 `<br><br>` 적용 (후처리 스크립트 실행 여부)
- [ ] 도입부 300~500자 AEO 정답 노드 포함
- [ ] 모든 본문 단락이 `se-text-paragraph` 클래스
- [ ] 대제목(30px) 5~7개, 섹션 사이 `<hr>`
- [ ] 프로필 표 1개 (`table-layout:fixed` + 레이블 `width:22%`)
- [ ] 행사 유형 표 1개 (`table-layout:fixed` + 헤더 왼쪽 `width:28~32%`)
- [ ] 모든 `<table>`에 `table-layout:fixed`
- [ ] 왼쪽 세로선 박스 2세트 각 3행
- [ ] 이미지 출처 표기 4개, 모두 `출처 - [아티스트명] 공식 SNS` 형식
- [ ] 유튜브 URL 정확히 2개 (raw URL)
- [ ] 따옴표 인용구 1~2회 (도입부/핵심 메시지/마무리)
- [ ] 명함 `<img>` 태그 본문에 없음
- [ ] 카카오 URL이 `https://open.kakao.com/o/squEahWg`
- [ ] `data:image/...` 또는 `image.png` 같은 깨지는 src 없음
- [ ] 해시태그 단락 20개 이상
- [ ] 메인 키워드(아티스트명+섭외) 본문 10~20회
- [ ] `📷 사진 N 삽입 위치` placeholder 없음
- [ ] 일반 `<p>` 태그 본문 없음
- [ ] `output/YYYY-MM-DD/{agency_slug}/` 경로에 저장됨
- [ ] `npm run build` 실행해 manifest.js 갱신함

---

# 에이전시 고정 정보

- **에이전시명:** 메이드인헤븐
- **활성 발행 계정:** `mih_speaker` (스피커), `mih_casting` (캐스팅), `mih_agency` (에이전시), `mih_history` (이전 발행 원고 보관)
- **카카오 오픈채팅 URL (모든 계정 공통):** `https://open.kakao.com/o/squEahWg`
- **명함 이미지 URL** (모아보기가 자동으로 합성하므로 원고에 직접 넣지 않음):
  - `mih_speaker`: `https://un1nlrbeiyjhkrdj.public.blob.vercel-storage.com/agency/mih_speaker/business-card.png`
  - `mih_casting`: `https://un1nlrbeiyjhkrdj.public.blob.vercel-storage.com/agency/mih_casting/business-card.png`
  - `mih_agency`: `https://un1nlrbeiyjhkrdj.public.blob.vercel-storage.com/agency/mih_agency/business-card.png`
- **명함 클릭 링크 (모든 계정 공통):** `tel:01054881456`
- 위 값들의 단일 출처는 `scripts/build-manifest.js` 상단 상수다. 변경 시 그 파일을 고치고 `npm run build` 실행.
- **톤:** 정중한 존댓말, 행사 기획 담당자 대상, 과장 없음.
