# 대시보드 UI/UX 개편 설계서

작성일: 2026-05-22
작성자: bpark (henry@treasurer.co.kr) + Claude
브랜치: `feat/supabase-discord-pg-cron` 이후 별도 브랜치 권장

---

## 1. 배경 및 목표

현재 비공개 사이트는 좌측 캘린더·원고 리스트와 우측 미리보기 iframe으로 구성된 단일 모아보기 화면, 별도 `/keywords`(키워드 관리), `/rss`(발행 현황) 페이지로 나뉘어 있다. 운영 시 한 화면에서 **"무엇이 새로 들어왔고, 무엇이 아직 안 올라갔고, 어떤 계정에 언제 얼마나 발행됐는지"** 를 파악하기 어렵고, 미리보기 영역이 좁아 복사 동선이 비효율적이다.

이 개편은 다음을 달성한다.

- 발행 파이프라인(작성 → 대기 풀 → 네이버 발행) 현황을 한눈에
- 매일 10건씩 빼는 운영 루틴에 맞춘 정렬·필터 동선
- 본문 복사 → 네이버 붙여넣기 흐름의 단축
- 키워드라는 별도 개념을 폐기하고 "원고 1건 = 단위"로 데이터 모델 단순화
- 시각적으로 일관된 SaaS 대시보드 톤 확립 (Tailwind + shadcn/ui)

원고 작성 지침(SE3 HTML, SEO, 이미지 4장 규칙 등)과 발행 워크플로우(output → publish-article.js → DB) 자체는 변경하지 않는다.

---

## 2. 합의된 결정 (브레인스토밍 결과)

| 항목 | 결정 |
|---|---|
| 메인 화면 구조 | 계정별 3컬럼 칸반 |
| 컬럼 내 그룹핑 | 발행 대기 풀 · 오늘 발행 · 최근 발행(접힘) |
| 풀 정렬 | 기본 FIFO(오래된순), 헤더 토글로 최신순·이름순 전환 |
| 컬럼 헤더 통계 | 풀 크기 · 오늘 발행 수 |
| 발행 판정 | 네이버 RSS 자동 매칭 (title 기반) + 수동 토글로 보정 |
| 미리보기 동선 | 중앙 큰 모달, 좌측 메타 패널 + 우측 미리보기, 키보드 순회 |
| 도메인 모델 | "원고 1건 = 단위". `keywords` 테이블 폐기, 메타는 `articles`에 통합 |
| 개편 범위 | 메인 + /rss + (구) /keywords. /keywords 라우트 자체는 제거 |
| 디자인 시스템 | Tailwind CSS + shadcn/ui |
| RSS 동기화 빈도 | 매일 09:55 KST 1회 (`rss-sync`). 기존 `discord-notify`(10:00 KST)는 그대로 유지. 운영 패턴상 매일 10시 이전에 발행이 끝나므로 1일 1회로 충분 |

---

## 3. 데이터 모델 변경

### 3.1 articles 테이블 확장

현재 `articles` 컬럼: `id, publish_date, agency, slug, person_name, title, html_content, source_path, created_at, updated_at`

다음 컬럼을 추가한다.

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `instagram_url` | text null | 공식 인스타그램 URL (인물 원고용). `collect-instagram-images.js`가 읽는다 |
| `category` | text null | 인물·강연·카테고리(행사공연 등) 분류 텍스트 |
| `notes` | text default '' | 자유 메모 |
| `published_at` | timestamptz null | 네이버 RSS에서 매칭된 발행 시각 (KST). null = 미발행 |
| `published_url` | text null | 매칭된 네이버 블로그 글 URL |
| `published_source` | text null check (`published_source` in ('rss','manual') or `published_source` is null) | 발행 판정 출처 — RSS 자동 / 수동 토글 구분 |

- `created_at`은 그대로 "DB 등록(작성 완료) 시각"으로 쓴다. UI의 "FIFO" 정렬과 "추가일"이 이 컬럼을 기준으로 한다.
- `published_at`은 매칭 시점에 RSS의 `pubDate`를 KST로 환산해 저장한다. 수동 토글 시에는 현재 시각.

### 3.2 keywords 테이블 폐기

`keywords` 테이블과 `migrate-keywords-to-db.js` 스크립트는 더 이상 사용하지 않는다. 데이터 이관 후 테이블을 drop한다.

이관 정책 (베스트-에포트):

- `keywords.keyword` 가 `articles.person_name` 또는 `articles.slug`와 일치하는 경우 `instagram`, `category`, `notes`, `published_url`을 그 행에 채워 넣는다.
- 다대다 매핑이 존재해 1:1로 떨어지지 않는 키워드는 별도 백업 테이블(`keywords_legacy`)로 옮긴 뒤 수동 정리 후 drop한다.
- 이관 스크립트는 `scripts/migrate-keywords-to-articles.js` 하나로 작성하고 멱등으로 만든다 (`on conflict do nothing`).

### 3.3 인덱스

- `articles_published_at_idx` (`published_at desc` partial: `where published_at is not null`)
- `articles_pool_idx` (`agency, created_at`) — 컬럼별 FIFO 정렬용 partial: `where published_at is null`

### 3.4 RLS

기존 service_role only 정책을 그대로 유지한다. 모든 쓰기·읽기는 Next.js 서버에서 service key로만 진행.

---

## 4. RSS 자동 매칭

### 4.1 매칭 로직 (서버 측)

기존 Edge Function `discord-notify`는 RSS를 fetch해 Discord로 알릴 뿐, DB와 매칭하지 않는다. 매칭은 별도 책임이므로 새 Edge Function `rss-sync`를 만든다.

`rss-sync` 동작:

1. 3개 계정 RSS(`https://rss.blog.naver.com/{slug}`) 동시 fetch
2. RSS 각 항목 → `{slug(agency), title, link, pubDate(ts)}` 정규화
3. 매칭 알고리즘:
   - 1차: `articles.title` 정확 일치 (대소문자·공백 정규화 후)
   - 2차: `articles.person_name + " 섭외"` 등 변형 일치
   - 3차: title에서 `^\[(.+?)(?:\s+섭외)?\]` 추출한 키워드가 person_name 또는 slug와 일치
4. 매칭 성공 → `update articles set published_at = pubDate, published_url = link, published_source = 'rss' where id = ?`
5. 매칭 실패 → `unmatched_rss_items` 테이블에 (`agency, title, link, pubDate, first_seen_at`) upsert로 적재. UI의 "DB에 없는 RSS 항목"으로 표시
6. 60일 이상 된 `unmatched_rss_items`는 자동 삭제

### 4.2 pg_cron 스케줄

```sql
-- 기존 discord-notify는 매일 10:00 KST 유지
-- rss-sync는 매일 09:55 KST (UTC 00:55) — discord-notify(10:00 KST) 직전
select cron.schedule('rss-sync', '55 0 * * *',
  $$ select net.http_post(url := 'https://<project>.functions.supabase.co/rss-sync', ...) $$
);
```

매칭은 멱등(이미 `published_at`이 있으면 skip)이라 잦은 호출이 안전하다.

### 4.3 수동 동기화

`/rss` 페이지의 "지금 동기화" 버튼은 서버 액션을 통해 `rss-sync` Function을 즉시 호출한다. 응답에 마지막 동기화 시각을 포함시켜 상단 표시.

### 4.4 매칭 실패 처리

UI의 "발행됨 표시" 토글은 다음을 수행한다.

- 미발행 → 발행: `published_at = now()`, `published_source = 'manual'`, `published_url`은 사용자가 선택적으로 입력
- 발행 → 미발행 (rollback): `published_at = null`, `published_url = null`, `published_source = null` (관리자 안전장치)

---

## 5. 페이지·라우트 구조

| 경로 | 역할 | 비고 |
|---|---|---|
| `/` | 메인 칸반 대시보드 | Server Component (기본 데이터 fetch) + Client Island (인터랙션) |
| `/rss` | 발행 현황 분석 | Server Component (집계 SQL) + Client (차트·필터) |
| `/articles/[id]` | 단일 원고 풀페이지 (모달의 ↗ 열기, URL 공유용) | Server Component |
| `/login` | 로그인 | 변경 없음 |
| `/api/articles` | 원고 목록/단건 GET/POST/PATCH | `/api/manuscripts` 신규 별칭. 기존 라우트도 한동안 유지 |
| `/api/rss-sync` | 수동 RSS 동기화 트리거 | Edge Function 호출 프록시 |
| `/api/auth/login`, `/api/auth/logout` | 변경 없음 | |
| `/keywords` | **삭제** | 라우트와 컴포넌트 모두 제거 |

### 5.1 모달 vs 풀페이지

모달이 기본 동선. URL 공유나 새 탭에서 열기가 필요할 때만 `/articles/[id]`로 이동한다. 모달 상태는 `?article=<id>` 쿼리 파라미터로 동기화해 새로고침/뒤로가기에서 복원되게 한다.

---

## 6. 컴포넌트 트리

```
app/
├── layout.tsx                          (RootLayout — Toast Provider 추가)
├── globals.css                         (Tailwind base + shadcn 변수)
├── page.tsx                            (DashboardPage — Server)
├── _components/                        (페이지 전용 컴포넌트 — 언더스코어 prefix라 Next.js 라우트 대상 아님)
│   ├── DashboardClient.tsx             ("use client" 루트)
│   ├── TopBar.tsx                      (탭 + 로그아웃 + 동기화 상태)
│   ├── KpiStrip.tsx                    (대기 풀/오늘/이번주/미매칭)
│   ├── FilterBar.tsx                   (검색 + 빠른 필터 칩)
│   ├── KanbanBoard.tsx                 (3컬럼 컨테이너)
│   ├── KanbanColumn.tsx                (계정별 컬럼 + 정렬 토글)
│   ├── ArticleCard.tsx                 (카드 한 장)
│   ├── ArticleModal.tsx                (Dialog — 메타 패널 + 미리보기)
│   ├── ArticleModalMeta.tsx            (좌측 메타 편집 폼)
│   ├── ArticleModalPreview.tsx         (우측 iframe + 명함 합성)
│   └── ArticleModalNav.tsx             (이전/다음 + 키보드 핸들러)
├── rss/
│   ├── page.tsx                        (RssPage — Server, 집계 fetch)
│   └── _components/
│       ├── RssClient.tsx
│       ├── RangePicker.tsx
│       ├── AgencyChart.tsx             (recharts 또는 직접 SVG)
│       ├── PublishHeatmap.tsx
│       └── DiagnosticList.tsx          (점검 필요 항목)
├── articles/[id]/page.tsx              (풀페이지 — Server)
└── api/...
components/
├── ui/                                 (shadcn 컴포넌트 — generated)
│   ├── dialog.tsx, button.tsx, input.tsx, ...
└── shared/
    └── BusinessCardMerger.ts           (현재 HomeView의 mergeWithBusinessCard 로직 이관)
lib/
├── agencies.ts                         (변경 없음)
├── auth.ts, auth-constants.ts          (변경 없음)
├── supabase.ts                         (변경 없음)
├── articles.ts                         (신규 — 쿼리 헬퍼)
└── rss-matcher.ts                      (신규 — title 정규화 + 매칭 로직, Edge Function과 공유)
supabase/
├── functions/
│   ├── discord-notify/                 (변경 없음)
│   └── rss-sync/                       (신규)
└── migrations/
    ├── 20260522000000_articles_meta_columns.sql
    ├── 20260522000001_unmatched_rss_items.sql
    ├── 20260522000002_keywords_to_articles.sql  (데이터 이관)
    └── 20260522000003_drop_keywords.sql         (이관 검증 후 별도 PR에서)
```

`HomeView.tsx`는 통째로 폐기되고 `DashboardClient`로 대체된다. `mergeWithBusinessCard`, `buildBusinessCardHtml`, `escapeHtml` 로직은 `components/shared/BusinessCardMerger.ts`로 추출해 재사용한다.

---

## 7. 핵심 인터랙션 디테일

### 7.1 카드 → 모달

- 카드 클릭, `Enter`, 카드에 포커스 후 `Space` 모두 모달 오픈
- 모달 오픈 시 URL이 `?article=<id>`로 변경 (History API push)
- 모달 안에서 `←`/`→` 또는 ‹ › 버튼은 **현재 칸반 컬럼·섹션 안에서** 순서대로 이동. 컬럼/섹션 경계는 넘지 않는다. 위치 인디케이터: "스피커 · 발행 대기 풀에서 4/12"
- `Esc`로 닫기. 닫으면 쿼리 제거.
- 모달 외 영역 클릭으로도 닫기

### 7.2 제목 복사

- shadcn `Toast` 또는 sonner로 "제목을 복사했어요" 토스트
- 1500ms 후 자동 dismiss
- 단축키: 모달이 열려 있을 때 `Cmd/Ctrl + C` (본문 영역 선택 안 한 상태에서만 — 본문 선택 중에는 일반 복사)

### 7.3 메타 편집

- 인스타 URL, 카테고리, 노트는 dirty 상태가 되면 입력창 테두리 색 변경 + "저장" 버튼 활성화
- 저장 = `PATCH /api/articles/[id]`. optimistic update.
- 저장 직후 `ArticleModalPreview`는 다시 fetch하지 않는다 (HTML 본문 변경 없음)
- 저장 실패 시 토스트 + 입력 상태 유지

### 7.4 발행됨 수동 토글

- `Switch` 컴포넌트를 메타 패널 "발행 상태" 그룹 안에 배치
- ON 시 같은 그룹 안에 `published_url` 입력란이 펼쳐짐 (선택 입력)
- 토글 변경 후 카드의 발행 상태가 즉시 반영 (optimistic)

### 7.5 발행 대기 풀의 정렬 토글

- 컬럼 헤더의 세그먼트 컨트롤(오래된순/최신/이름)
- 선택값은 localStorage에 컬럼별로 저장 (계정 컬럼이 서로 다른 정렬을 기억)

### 7.6 검색·필터

- 검색은 디바운스 200ms. `person_name`, `title`, `slug`, `notes` ILIKE 매칭.
- 빠른 필터 칩(전체/미발행/오늘/인스타URL 미등록)은 다중 선택 불가, 단일 선택. "키워드 미등록"은 "인스타URL 미등록"으로 라벨 변경.

### 7.7 단축키 요약

| 키 | 동작 |
|---|---|
| `Esc` | 모달 닫기 |
| `←` / `→` | 모달 안 이전/다음 원고 |
| `Enter` (카드 포커스) | 모달 열기 |
| `Cmd/Ctrl + K` | 검색창 포커스 |
| `g k` | 칸반 페이지 (전역) |
| `g r` | 발행 현황 페이지 (전역) |

---

## 8. /rss 페이지 상세

### 8.1 데이터 집계

서버에서 한 번의 SQL로 일자별·계정별 집계를 만든다.

```sql
select
  date_trunc('day', published_at at time zone 'Asia/Seoul') as day,
  agency,
  count(*) as published
from articles
where published_at is not null
  and published_at >= $1 and published_at < $2
group by 1, 2
order by 1, 2;
```

추가로 `unmatched_rss_items`와 발행 0건 의심일을 별도 쿼리.

### 8.2 차트 라이브러리

shadcn의 `chart` 컴포넌트(recharts wrapper)를 우선 사용. 그래도 무거우면 SVG 직접.

### 8.3 점검 항목 액션

- "DB에 없는 RSS 항목" → 클릭 시 RSS 원문 링크 새 탭으로
- "DB에 있으나 RSS 미매칭" → 클릭 시 해당 article 모달 열기 (메인으로 이동 후 모달 표시)
- "발행 0건 의심일" → 단순 표시. 사용자가 의도한 휴일이면 무시 가능.

---

## 9. 디자인 토큰 (Tailwind + shadcn 변수)

`app/globals.css`의 `:root`에 정의.

| 토큰 | 값 |
|---|---|
| `--primary` | `#1565C0` |
| `--speaker` | `#1565C0` |
| `--casting` | `#7B1FA2` |
| `--agency` | `#2E7D32` |
| `--warning` | `#F9A825` |
| `--danger` | `#C62828` |
| `--muted` | `#F5F6F8` |
| `--border` | `#E3E5EA` |
| `--text` | `#222` |
| `--text-muted` | `#888` |
| `--radius` | `0.5rem` |

폰트: 시스템 폰트 스택 유지. `font-feature-settings: "tnum"` 으로 숫자 정렬.

---

## 10. 에러 핸들링 & 엣지 케이스

| 케이스 | 처리 |
|---|---|
| RSS fetch 실패 (네이버 장애) | KPI "RSS 미매칭" 표시 유지, 상단에 "마지막 동기화 N분 전" 경고 배지 |
| 매칭 알고리즘이 잘못된 article에 매칭 | "발행됨 표시"의 rollback 토글로 수동 정정. `published_source = 'manual'`로 표시되어 추적 가능 |
| 한 RSS 항목에 여러 DB article 매치 후보 | 가장 최근에 created_at된 미발행 article에 매칭. 충돌 발생 케이스를 `unmatched_rss_items`에도 동시 기록해 점검 항목으로 노출 |
| 모달 열린 상태에서 카드 데이터 변경 (다른 탭) | revalidatePath로 재조회. 모달 안 메타는 dirty가 있으면 confirm |
| 인스타 URL이 유효하지 않은 형식 | 클라이언트 validation: `^https?://(www\.)?(instagram\.com|fb\.com|...)` 화이트리스트. 저장은 막지 않고 노란색 경고 |
| iframe 미리보기 본문 너무 길어 스크롤 | iframe 자체에 scroll 허용. 본문 드래그 복사 영역 유지 |
| `keywords` 이관 시 매칭 안 되는 row | `keywords_legacy`로 옮기고 사용자에게 정리 요청 |

---

## 11. 마이그레이션 & 롤아웃

### 11.1 단계

1. **DB 마이그레이션 (PR 1)**
   - `articles` 컬럼 추가
   - `unmatched_rss_items` 신규 테이블
   - 인덱스 추가
   - keywords → articles 데이터 이관 SQL
   - `keywords_legacy` 백업 테이블 (drop은 별도 PR)
2. **rss-sync Edge Function 배포 (PR 2)**
   - pg_cron 등록
   - 일주일간 매칭 결과 모니터링
3. **UI 신규 페이지 (PR 3, feature flag)**
   - `/dashboard-v2` 라우트로 신규 UI 빌드, 기존 `/` 유지
   - 동일 데이터를 신구 UI 모두에서 본다 (write는 articles에 통합)
   - 매일 한두 번 본인이 직접 사용해 검증
4. **스위치 오버 (PR 4)**
   - `/` → 신규 UI로 교체, 구 UI 제거
   - `/keywords` 라우트 제거
   - `migrate-keywords-to-db.js` 스크립트 제거
5. **정리 (PR 5)**
   - `keywords` 테이블 drop
   - `keywords_legacy` drop (수동 정리 완료 확인 후)
   - `/api/manuscripts` → `/api/articles` 별칭 유지/이전

### 11.2 워크플로우 영향

- `npm run publish "<html>"`: 변경 없음 (articles upsert)
- `node scripts/upload-article-images.js`: 변경 없음
- `node scripts/collect-instagram-images.js`: `keywords.instagram` 읽던 부분을 `articles.instagram_url`에서 읽도록 수정
- `AGENTS.md`: "키워드 DB 등록" 9번 항목을 "**모아보기 모달에서 인스타그램 URL 등록**"으로 수정

### 11.3 RSS 동기화 주기

기존 `discord-notify`(매일 10:00 KST)는 유지. 신규 `rss-sync`는 그 직전 09:55 KST에 1회 실행해 DB 매칭을 완료한다. 운영 패턴상 발행이 매일 10시 이전에 끝나므로 1일 1회로 충분하며, 더 잦은 폴링은 불필요한 RSS 부하만 발생시킨다.

---

## 12. 테스트 & 검증

- **단위:** `lib/rss-matcher.ts`의 title 정규화·매칭을 케이스 표(스피커 제목 패턴, 캐스팅 제목 패턴, 카테고리 제목 패턴)로 vitest 테스트
- **통합:** `rss-sync` Edge Function이 실제 RSS 응답 fixture에서 기대 매칭 수와 미매칭 수를 만족하는지
- **수동:**
  - 신규 UI에서 카드 클릭 → 모달 오픈 → 제목 복사 → 네이버 글쓰기에 붙여넣기 흐름 처음부터 끝까지
  - 다음 날 09:55 KST cron 실행 후 카드가 "발행됨"으로 자동 이동하는지 (즉시 확인이 필요하면 수동 동기화 트리거 사용)
  - 인스타 URL 편집 후 `node scripts/collect-instagram-images.js`가 정상 동작하는지
- **회귀:**
  - `npm run publish "<html>"` 후 신규 UI에 즉시 반영되는지
  - 명함 자동 합성이 본문 내 카카오 링크를 정확히 찾는지 (현재 로직 보존)

---

## 13. 스코프 밖

- 모바일 전용 레이아웃 (현재 비공개 데스크탑 운영 도구라 우선순위 낮음)
- 다국어
- 사용자 다계정 / 권한 분리 (현재 단일 사용자)
- 댓글·태그 등 협업 기능
- 통계 알림 자동화 (Discord 이외)
- 차트 라이브러리 분기 (recharts 외 대안 검토는 첫 구현 후 성능 보고 결정)

---

## 14. 열린 질문

다음은 구현 시작 전에 한 번 더 정리할 가치가 있는 항목.

1. RSS 매칭 알고리즘의 3차 fallback이 너무 느슨해서 오매칭이 생기면, fallback 깊이를 줄이고 미매칭으로 남기는 게 안전한가
2. `keywords_legacy`에 남은 데이터의 처리 책임자·정리 데드라인
3. `published_at` 외에 "DB에 입력된 시각"과 "원고가 처음 만들어진 시각"이 다르다 (output HTML의 폴더 날짜 vs created_at). FIFO 정렬에서 어느 쪽을 기준으로?

이 질문들은 구현 계획(writing-plans)에서 다시 확인한다.
