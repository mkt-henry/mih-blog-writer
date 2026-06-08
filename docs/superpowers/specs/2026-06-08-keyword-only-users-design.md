# 키워드 전용 사용자 + 키워드 테이블 컬럼 가시성 제어 — 설계

작성일: 2026-06-08

## 1. 목적

두 가지 새 권한 차원을 추가한다.

1. **키워드 전용 사용자**: 특정 사용자가 `/keywords` 페이지만 접근 가능하고, 모아보기(`/`)·발행현황(`/rss`)·사용자관리(`/admin/users`)는 차단·네비게이션 숨김.
2. **컬럼 가시성**: 키워드 테이블에서 관리자가 **전역으로 지정한 컬럼 1세트**만 키워드 전용 사용자에게 노출. 원고(본문 열람) 컬럼은 키워드 전용 사용자에게 항상 제외.

## 2. 결정 사항 (확정)

- 접근 모델: **키워드 전용 사용자** (페이지별 토글이 아닌 단일 플래그). → `app_users.keyword_only`
- 컬럼 지정 단위: **전역 1세트** (사용자별 아님).
- 컬럼 제한 적용 대상: **키워드 전용 사용자에게만**. admin·기존 일반(agency 권한) 사용자는 영향 없음 — 지금처럼 전체 컬럼.
- 원고 열람: **항상 제외**. 컬럼셋과 무관하게 키워드 전용 사용자에겐 원고 컬럼/본문 복사 미노출.
- 저장소: 전역 컬럼셋은 `app_settings`가 아닌 **신규 `app_config` 테이블**에 저장. (app_settings는 `secrets-pull`이 전부 `.env.local`로 덤프하므로 한글·JSON 설정을 섞으면 env가 깨지고 비밀값 테이블이 오염됨)

## 3. 컬럼 후보 풀 + 기본값

키워드 테이블에서 토글 가능한 컬럼과 기본 노출 상태:

| 컬럼 키 | 라벨 | 기본 | 비고 |
|---------|------|:----:|------|
| `keyword` | 키워드 | ✅ 항상 | 끌 수 없음(페이지 핵심) |
| `search` | 검색(네이버 버튼) | ✅ | |
| `category` | 분류 | ✅ | |
| `agency` | 계정 | ⬜ | 내부 분류라 기본 숨김 |
| `published_url` | 발행 URL | ⬜ | |
| `instagram` | 인스타그램 | ⬜ | 현재 미표시 데이터, 노출 시 컬럼 추가 |
| `notes` | 메모 | ⬜ | 현재 미표시 데이터, 노출 시 컬럼 추가 |

- `article`(원고) 컬럼은 후보 풀에서 제외 — 키워드 전용 사용자에겐 영구 비노출.
- `#`(행 번호)는 컬럼 토글 대상이 아니며 항상 표시.

## 4. 데이터 모델

### 4.1 `app_users.keyword_only`
```sql
alter table app_users
  add column if not exists keyword_only boolean not null default false;
```
- `true`면 키워드 전용 사용자.
- admin(`isAdminUsername`)은 이 플래그와 무관하게 항상 전체 접근(가드에서 admin 우선 판정).

### 4.2 신규 `app_config` 테이블 (UI 설정 전용 key-value)
```sql
create table if not exists app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);
alter table app_config enable row level security;
create policy "service_role_only" on app_config
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 전역 컬럼셋 기본값 시드 (멱등)
insert into app_config (key, value)
values ('keyword_only_columns', '["keyword","search","category"]'::jsonb)
on conflict (key) do nothing;
```
- `keyword_only_columns`: 노출 컬럼 키의 JSON 배열. `keyword`는 항상 포함(저장값에 없어도 런타임에서 강제 포함).

## 5. 모듈 설계

### 5.1 `lib/permissions.ts` 확장
- `UserPermissions`에 `keywordOnly: boolean` 추가.
- `loadPermissions`가 `app_users.keyword_only`를 읽어 채움. admin이면 항상 `false`(전체 접근).
- 신규 헬퍼: `lib/keyword-columns.ts`
  - `KEYWORD_COLUMNS`: 후보 컬럼 메타(키, 라벨, 기본값, 항상노출 여부) 단일 출처(SSOT).
  - `loadKeywordOnlyColumns(): Promise<string[]>` — `app_config`에서 읽어 유효 키만 반환, `keyword` 강제 포함. 누락/오류 시 기본값.
  - `normalizeColumns(keys: string[]): string[]` — 유효성 검사 + `keyword` 강제 + 원고 제외.

이 두 파일이 "어떤 컬럼이 존재하고 무엇이 보이는가"의 단일 출처가 된다.

### 5.2 접근 제어 — 서버 컴포넌트 가드
middleware는 edge라 DB 조회를 하지 않으므로(쿠키 유무만 확인) 유지. 페이지 단위로 가드:
- `app/page.tsx`(모아보기), `app/rss/page.tsx`, `app/admin/users/page.tsx`:
  세션·권한 로드 후 `perms.keywordOnly === true`면 `redirect("/keywords")`.
- `app/layout.tsx`: `loadPermissions` 결과의 `keywordOnly`를 `NavBar`에 전달.

### 5.3 `NavBar`
- props에 `keywordOnly: boolean` 추가.
- `keywordOnly`면 "키워드" 링크만 렌더(모아보기·발행현황·사용자관리 숨김).

### 5.4 키워드 페이지 (`app/keywords/page.tsx` + `KeywordClient`)
- `page.tsx`: `perms.keywordOnly`이면 `loadKeywordOnlyColumns()`로 노출 컬럼 키 배열을 구해 `KeywordClient`에 `visibleColumns`로 전달. 아니면 `null`(=전체, 기존 동작).
  - 키워드 전용 사용자는 `isEditor=false`로 강제 → 원고 컬럼/KPI/상태필터 자동 숨김(기존 로직 재사용).
  - KPI 스트립: 키워드 전용 사용자에겐 "전체"와 카테고리 카운트 정도만(원고/발행 KPI는 isEditor 게이트로 이미 숨김).
- `KeywordClient`: `visibleColumns?: string[] | null` prop 추가.
  - `null`이면 현재와 동일.
  - 배열이면 colgroup·thead·tbody에서 해당 컬럼만 렌더. 컬럼 렌더링을 `KEYWORD_COLUMNS` 메타 기반으로 리팩터링(하드코딩된 7개 `<th>`/`<td>`를 맵 순회로 정리)하여 가시성 분기를 한 곳에서 처리.

### 5.5 관리 UI (`app/admin/users`)
- `UsersTable`: 각 사용자 행에 "키워드 전용" 토글(체크박스) 추가. admin 사용자 행은 비활성(항상 전체).
- 페이지 상단에 **전역 컬럼셋 편집 카드**: 후보 컬럼 체크박스 목록(`keyword`는 고정 체크·비활성), 저장 버튼.
- API:
  - `PATCH /api/admin/users/[id]` 확장 또는 신규 필드: `keyword_only` 토글 반영.
  - 신규 `app/api/admin/settings/keyword-columns/route.ts` (`GET`/`PUT`): 전역 컬럼셋 조회·저장. 모든 admin 전용 가드(`requireAdmin`).

## 6. 데이터 흐름

```
로그인 → verifySession → loadPermissions(keyword_only 포함)
  ├─ layout: NavBar(keywordOnly) — 링크 제한
  ├─ /, /rss, /admin/users: keywordOnly면 redirect(/keywords)
  └─ /keywords:
       keywordOnly → loadKeywordOnlyColumns(app_config) → visibleColumns
       KeywordClient(visibleColumns, isEditor=false)
         → KEYWORD_COLUMNS 메타로 보이는 컬럼만 렌더 (원고 영구 제외)
```

## 7. 보안 / 엣지 케이스

- **서버 측 강제**: 컬럼 숨김은 CSS가 아니라 데이터 단에서 강제한다. 키워드 전용 사용자의 `page.tsx` 서버 쿼리는 `visibleColumns`에 **포함된 컬럼만** select 한다 — 즉 컬럼셋에서 꺼진 `notes`/`instagram`/`published_url` 등은 애초에 클라이언트로 전송되지 않는다(`keyword`/`category`는 식별·분기용으로 항상 포함). 원고 본문은 `/api/articles/[id]`에서 별도 가드 — 키워드 전용 사용자는 UI에서 호출 경로가 없고, 추가로 해당 API에 `keywordOnly` 차단 가드를 적용한다.
- admin 우선: `isAdminUsername`이 true면 `keyword_only` 값과 무관하게 전체 접근.
- 잘못된/빈 `app_config` 값 → 기본 컬럼셋 폴백.
- `keyword`는 저장값에서 빠져도 런타임 강제 포함(빈 테이블 방지).
- 마이그레이션은 모두 멱등(`if not exists` / `on conflict do nothing`).

## 8. 테스트

- `tests/permissions.test.ts` 확장: `keywordOnly` 사용자에 대한 `loadPermissions` 결과, admin 우선순위.
- `lib/keyword-columns.ts` 단위 테스트: `normalizeColumns`(원고 제외, keyword 강제, 무효 키 필터), 폴백.
- 가드: 키워드 전용 사용자가 보호 페이지 접근 시 리다이렉트(가능하면 라우트 단위 테스트 또는 헬퍼 함수 분리 후 단위 테스트).

## 9. 범위 밖 (YAGNI)

- 사용자별 컬럼셋, 페이지별 세분화 권한, role enum 일반화.
- 키워드 전용 사용자의 부분 agency 제한(질문에서 불요로 판단).
