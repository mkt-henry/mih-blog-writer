# 키워드 파일 영속화 설계

**작성일:** 2026-05-12
**작성자:** Henry + Claude

## 배경

`output/keywords.html` 의 키워드 데이터가 브라우저 `localStorage` (key `mih_keywords`) 에만 저장되고 있다. 이로 인해 다음 상황에서 데이터가 사라진다.

- 다른 브라우저/프로필에서 열기 — Chrome 에서 등록한 데이터가 Edge 에서 안 보임
- 다른 origin 에서 열기 — `npx serve` 가 포트 점유 시 fallback 으로 3000 → 5000 등으로 옮겨가면 origin 이 바뀌어 localStorage 가 분리됨
- 브라우저 데이터 삭제 / 시크릿 창
- 다른 컴퓨터에서 `git sync` 해도 키워드는 따라오지 않음 (저장소에 데이터가 없으므로)

b91037e (2026-05-08) "Simplify project: local-only, drop Supabase" 커밋에서 외부 서비스 의존을 제거하면서 키워드 데이터가 브라우저-로컬에만 남게 된 것이 원인.

## 목표

키워드 데이터를 프로젝트 폴더의 JSON 파일에 영속 저장해서 다음을 보장한다.

1. 브라우저/프로필/포트와 무관하게 같은 데이터를 본다
2. `git sync` 로 다른 컴퓨터에서도 동일한 키워드를 본다
3. 외부 서비스(Supabase 등) 의존 없이 로컬-온리 철학을 유지한다
4. 사용자는 별도 저장 액션 없이 자동 저장된다

## 비목표

- 마이그레이션 — 사용자가 키워드 0개 상태에서 새로 등록하기로 함
- 충돌 해결 — 단일 사용자/단일 시점 사용을 가정. 동시 편집 케이스 다루지 않음
- 자동 git commit — 사용자가 직접 `git add output/keywords.json && git commit` 한다

## 아키텍처

### 데이터 모델

**`output/keywords.json`** — 새 파일, git 에 커밋

```json
[
  {
    "id": "abc123",
    "keyword": "김미경",
    "category": "강연자",
    "instagramUrl": "https://...",
    "createdAt": "2026-05-12T01:23:45.000Z"
  }
]
```

기존 `keywords.html` 의 인-메모리 객체 스키마와 동일. 파일이 존재하지 않으면 빈 배열로 취급.

### 컴포넌트 3개

#### 1. `output/keywords.json` — 데이터 (source of truth)

- 키워드 객체 배열
- git 에 커밋됨 (`.gitignore` 추가하지 않음)
- 런타임에 dev server 가 생성/갱신

#### 2. `scripts/dev-server.js` — dev 서버

기존 `npx serve output` 을 대체. Node 내장 모듈(`http`, `fs/promises`, `path`) 만 사용. 의존성 추가 없음.

**라우트:**

| 메서드 | 경로 | 동작 |
|--------|------|------|
| GET | `/api/keywords` | `output/keywords.json` 읽어서 JSON 반환. 파일 없으면 `[]` 반환 |
| POST | `/api/keywords` | body(JSON 배열) 검증 후 `output/keywords.json` 에 원자적 쓰기 (tmp 파일에 쓰고 `rename`) |
| GET | `/*` | `output/` 디렉터리의 정적 파일 서빙 (MIME 타입 기본 셋: html, js, css, json, png, jpg) |

**포트 정책:**
- 3000 고정. 점유 시 에러 종료 (fallback 없음 — origin 분리 방지)
- `PORT` 환경변수로 오버라이드 가능

**POST 검증:**
- Content-Type 이 `application/json` 인지 확인
- body 가 배열인지 확인
- 각 항목이 `id`, `keyword`, `category` 필드를 가진 객체인지 확인
- 실패 시 400 응답

**원자적 쓰기:**
- `output/keywords.json.tmp` 에 먼저 쓰고
- `fs.rename` 으로 `output/keywords.json` 으로 옮김
- 쓰기 도중 프로세스 죽어도 부분 파일이 본 파일을 덮어쓰지 않음

**로그:** 콘솔에 요청 메서드/경로, POST 시 항목 수, 에러 출력.

#### 3. `output/keywords.html` — UI

**제거:**
- `STORE_KEY` 상수
- `localStorage.getItem` / `setItem` 호출 일체
- localStorage 기반의 동기 `loadKeywords` / `saveKeywords` 구현

**추가:**
- async `loadKeywords()` — `fetch('/api/keywords')` 후 JSON 파싱. 실패 시 throw
- async `saveKeywords(arr)` — `POST /api/keywords` with JSON body. 실패 시 throw
- 부팅 흐름:
  ```js
  let keywords = [];
  try {
    keywords = await loadKeywords();
  } catch (e) {
    showToast('dev server 응답 없음 — npm run dev 확인');
  }
  renderList(); renderDetail();
  ```
- mutation 5곳 (등록, 수정, 삭제, 중복 정리, 대량 등록) 모두 동일 패턴:
  ```js
  // 인-메모리 keywords 배열 갱신
  try {
    await saveKeywords(keywords);
    renderList();
    renderDetail();
  } catch (e) {
    showToast('저장 실패: ' + e.message);
  }
  ```
- 핸들러를 async 로 바꾸고 `await` 추가

### 데이터 흐름

```
[브라우저]                          [dev server]                [디스크]
  로드 ──fetch GET /api/keywords──→  read JSON ──────────────→  keywords.json
       ←──────── 200 [...] ────────
  렌더

  등록 클릭
  in-memory 수정
  POST /api/keywords ──body──────→  validate → atomic write ──→  keywords.json
       ←──────── 200 OK ──────────
  성공 시 토스트 없음 (조용히 성공). 실패 시에만 토스트 노출
```

## 동작 변경

### `package.json`

```diff
- "dev": "npx serve output"
+ "dev": "node scripts/dev-server.js"
```

### 파일 변경 요약

| 종류 | 경로 | 변경 |
|------|------|------|
| 신규 | `scripts/dev-server.js` | Node http 서버 |
| 신규 | `output/keywords.json` | 런타임에 생성 (등록 첫 회) |
| 수정 | `output/keywords.html` | load/save async + localStorage 제거 |
| 수정 | `package.json` | dev 스크립트 교체 |

## 에러 처리

| 상황 | 동작 |
|------|------|
| dev server 미동작 (load 실패) | 토스트 "dev server 응답 없음", 빈 배열로 시작 |
| dev server 미동작 (save 실패) | 토스트 "저장 실패", 인-메모리 변경은 그대로 유지 (다음 mutation 시 재전송) |
| `keywords.json` 손상 / 파싱 실패 | dev server 가 GET 응답으로 500 + 콘솔에 에러 로그. 브라우저는 빈 배열로 시작 |
| POST body 검증 실패 | 서버 400 응답. 브라우저는 토스트 |
| 디스크 쓰기 실패 (권한/공간) | 서버 500 응답. 브라우저는 토스트 |

## 검증 방법

수동 시나리오:

1. `npm run dev` → 브라우저 `http://localhost:3000/keywords.html`
2. 키워드 1개 등록 → `output/keywords.json` 생성·내용 확인
3. 페이지 새로고침 → 등록한 키워드 표시 확인
4. 대량 등록 5개 → 파일 즉시 반영 확인
5. 수정/삭제 → 파일 반영 확인
6. dev server 종료 후 등록 시도 → "저장 실패" 토스트 노출 확인
7. `git status` → `output/keywords.json` staged 가능

## 향후 확장

- 자동 git commit 옵션 — 등록 후 자동 commit 하고 싶다면 별도 PR
- 다중 사용자 동기화 — Supabase 도입 시 별도 설계
- export/import — JSON 파일 자체가 이미 export 형식이라 별도 기능 불필요
