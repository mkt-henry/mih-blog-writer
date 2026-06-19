# artsro 키워드 크롤러 + 스킬 설계

작성일: 2026-06-19

## 목적

강연·섭외 에이전시 사이트 [artsro.com](https://www.artsro.com)의 인물 목록(인물 = 블로그 섭외 원고의 "키워드")을
자동 크롤링하여, 우리 `keywords` 테이블과 **중복 여부를 판정**하고, **신규 인물만 추가**하면서
**발행 계정(`agency`)을 자동 설정**한다. 전체 작업은 새 스킬 `crawl-artsro`로 실행한다.

## 배경 / 현황

- 대상 사이트: `https://www.artsro.com/right/enter_list.html?CatNo={CatNo}`
  - 인물 목록이 **정적 HTML**로 제공됨 (JS 동적 로딩 없음) → Puppeteer 불필요, `fetch` + 파싱으로 충분
  - 페이지네이션: `?CatNo={n}&...&start={offset}` 오프셋 방식, **페이지당 15명**
  - 각 인물: 이름 + 한 줄 소개 + 상세링크 `enter_view.html?GoIdx={GoIdx}&CatNo={n}`
  - 카테고리 트리: 약 100개 CatNo (연예인/셀럽/음악/댄스/퍼포먼스/클래식/전통/MC/기획공연/외국인)
- 기존 자산 재활용:
  - `keywords` 스키마: `id text PK`, `keyword`, `category not null`, `notes`, `instagram`, `agency`,
    `published_url`, `is_active bool default true`
  - `scripts/lib/supabase-rest.js` — 무의존 PostgREST 클라이언트(`supabaseSelect`/`supabaseUpsert`)
  - `scripts/pick-keywords.mjs` — 정규화/중복 판정(`norm`, `stripParen`, 양방향 `startsWith`)
  - `scripts/assign-keyword-agency.mjs` — 연예인 3분할(`[mih_casting, mih_agency, other]` 랜덤 라운드로빈)
- repo 관례: 스크립트는 **새 의존성 없이 `fetch`만** 사용 (cheerio/jsdom 등 미사용)

## 접근법 결정

**A. 단일 Node ESM 스크립트(dry-run/`--apply`) + 얇은 스킬 래퍼** (채택)

- repo 관례에 정확히 부합, dry-run 리포트가 중간 검수 산출물을 대체, 의존성 0, `id=artsro-{GoIdx}`로 멱등.
- 대안 B(cheerio 추가)는 무의존 철학과 충돌하고 정적·단순 목록엔 과함.
- 대안 C(크롤러→JSON 덤프→별도 임포터)는 스크립트 2개+파일 아티팩트로 복잡(A의 dry-run이 이점 흡수).

## 컴포넌트 구조

파일: `scripts/crawl-artsro-keywords.mjs` (ESM). 테스트 가능하도록 순수 함수 분리/export:

- `parseListPage(html, catNo)` → `[{ goIdx, name, desc }]`
  - 정규식으로 `enter_view.html?GoIdx={d+}&CatNo=...` 앵커와 이름/소개 텍스트 추출
- `classify(catNo)` → `{ category, agency }` (아래 매핑)
- `isDuplicate(name, excludedSet)` → 정규화 후 양방향 `startsWith` (pick-keywords 로직 재사용)
- `buildRow({ goIdx, name, desc, catNo })` → keywords upsert 행 객체
- `main()` → fetch 순회 + DB 비교 + 리포트/apply (네트워크·DB I/O는 여기서만)

정규화 헬퍼는 pick-keywords와 동일:
`stripParen` (첫 여는 괄호 이후 제거) → `norm` (괄호제거+공백제거+소문자).

## CatNo → category/agency 매핑 (코드 내 상수 테이블)

| 그룹 | CatNo | DB category | agency |
|---|---|---|---|
| 강연·전문가 | 87,88,90,95,97,129,91,92,93,94,96 | 강연자 | **mih_speaker** |
| 개그맨 | 85,86 | 개그맨 | 3분할 |
| 방송인·MC | 89,83,84,114,69,71,72,73 | 방송인 | 3분할 |
| 그 외 모든 CatNo | 가수세부 74~82 + 음악·댄스·퍼포먼스·클래식·전통·기획공연·외국인 전 공연단체 | 가수 | 3분할 |

- **"전체 순회" = 이 맵에 등록된 모든 CatNo를 반복**한다.
- 공연 단체(비보이팀·오케스트라·재즈밴드 등)는 우리 스키마에 맞는 category가 없어 **`가수`로 일괄 라벨링**(agency는 3분할). 사용자 승인됨.
- **네비 드리프트 감지**: 사이트 네비에서 맵에 없는 새 CatNo가 발견되면 경고 출력(기본은 가수/3분할로 처리).
- **3분할**: `assign-keyword-agency.mjs`와 동일하게 `[mih_casting, mih_agency, other]` 랜덤 라운드로빈.

## 크롤링 & 파싱 흐름

1. 맵의 CatNo별로 `start=0,15,30…` 증가시키며 목록 페이지 fetch
2. `parseListPage`로 인물 추출, **0건이면 해당 CatNo 종료**(마지막 페이지 도달)
3. 요청 사이 ~400ms 딜레이(예의상 rate limit)
4. 페이지 fetch는 **2~3회 재시도 + 지수 백오프**

### 방어
- 어떤 CatNo 첫 페이지가 0건 → 경고 후 다음 CatNo로 계속
- **전체 통틀어 0건 → 비정상으로 판단, `exit 1`** (사이트 마크업 변경 감지)
- 페이지 네트워크 오류(재시도 소진) → 해당 페이지만 경고 후 스킵(전체 중단 안 함)
- Supabase upsert 오류 → throw

## 중복 판정 & 신규 처리

- **제외(중복) 집합** = 기존 `keywords.keyword` 전체 + `articles.person_name` 전체
  - 정규화: 괄호주석 제거 + 공백제거 + 소문자, 양방향 `startsWith`로 "임용한 박사"↔"임용한", "송길영작가"↔"송길영" 흡수
- 신규(= 제외 집합에 없음)만 처리. upsert 행:
  - `id = "artsro-{GoIdx}"` — 재실행 멱등, `on_conflict=id` + `merge-duplicates`
  - `keyword = name`
  - `category` / `agency` = 매핑 결과
  - `is_active = true`, `published_url = null`, `instagram = null`
  - `notes = "{한 줄 소개} | https://www.artsro.com/right/enter_view.html?GoIdx={GoIdx}&CatNo={catNo}"`

## 실행 모드

- **기본(dry-run)**: 쓰기 없음. 출력 = CatNo별 수집 수 / 전체 수집·신규·중복(스킵) 수 /
  신규 목록을 category·agency별로 그룹핑
- **`--apply`**: 신규 행만 청크(200) upsert, 반영 건수 출력
- npm 스크립트: `"crawl:keywords": "node scripts/crawl-artsro-keywords.mjs"`

## 스킬 통합

새 스킬 `crawl-artsro` — `.claude/skills/crawl-artsro/SKILL.md` 와 `.agents/skills/crawl-artsro/SKILL.md` 양쪽.

SKILL.md 절차(naver-article과 동일한 "확인 전 apply 금지" 게이트):
1. dry-run 실행 (`node scripts/crawl-artsro-keywords.mjs`)
2. 리포트를 사용자에게 제시하고 **확인 받기**
3. `--apply`로 실제 반영
4. 결과 보고

## 테스트 (vitest)

- `parseListPage`: 저장한 샘플 HTML 픽스처 → 이름·GoIdx 추출 검증
- `classify`: 대표 CatNo(87→강연자/mih_speaker, 85→개그맨/3분할, 89→방송인, 40(댄스)→가수) 검증
- `isDuplicate`: "임용한 박사" / "송길영작가" / 정확일치 / 비매칭 경계 케이스
- 네트워크·DB는 테스트에서 호출하지 않음(순수 함수만 대상)

## 비범위 (YAGNI)

- 상세 페이지(`enter_view.html`) 크롤링 — 목록의 이름+소개+링크로 충분
- 인스타그램/이미지 수집 — 별도 `collect-instagram-images.js` 경로가 담당
- artsro 외 사이트 — 본 설계는 artsro 전용
