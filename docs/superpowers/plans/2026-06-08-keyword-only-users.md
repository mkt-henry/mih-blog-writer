# 키워드 전용 사용자 + 컬럼 가시성 제어 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 특정 사용자를 `/keywords` 페이지만 접근 가능한 "키워드 전용 사용자"로 지정하고, 그들에게 보일 키워드 테이블 컬럼을 관리자가 전역으로 통제한다.

**Architecture:** 기존 agency 권한 체계와 직교하는 `app_users.keyword_only` 플래그를 추가한다. 전역 컬럼셋은 신규 `app_config`(jsonb) 테이블에 저장한다. 컬럼 메타는 `lib/keyword-columns.ts`를 단일 출처(SSOT)로 둔다. 접근 차단은 서버 컴포넌트/route 가드에서 `keywordOnly` 판정으로 처리한다.

**Tech Stack:** Next.js App Router (server components), Supabase(서비스 롤), TypeScript, Vitest.

**설계 문서:** `docs/superpowers/specs/2026-06-08-keyword-only-users-design.md`

---

## 파일 구조

| 파일 | 책임 | 작업 |
|------|------|------|
| `supabase/migrations/20260608000000_keyword_only_users.sql` | DB 스키마 | Create |
| `lib/keyword-columns.ts` | 컬럼 메타 SSOT + 정규화/로드 | Create |
| `tests/keyword-columns.test.ts` | 정규화 단위 테스트 | Create |
| `lib/permissions.ts` | `keywordOnly` 권한 필드 | Modify |
| `tests/permissions.test.ts` | mkPerms 헬퍼 갱신 | Modify |
| `app/layout.tsx` | NavBar에 `keywordOnly` 주입 | Modify |
| `app/_components/NavBar.tsx` | 링크 제한 | Modify |
| `app/page.tsx` | 키워드 전용 차단 가드 | Modify |
| `app/rss/page.tsx` | 세션+키워드 전용 차단 가드 | Modify |
| `app/api/articles/[id]/route.ts` | GET 키워드 전용 차단 | Modify |
| `app/keywords/page.tsx` | 컬럼셋 계산 + 동적 select | Modify |
| `app/keywords/_components/KeywordClient.tsx` | `visibleColumns` 기반 렌더 | Modify |
| `app/admin/users/page.tsx` + `AdminUserRow` | `keywordOnly` 행 데이터 | Modify |
| `app/api/admin/users/[id]/route.ts` | `keyword_only` 토글 PATCH | Modify |
| `app/api/admin/users/route.ts` | GET 응답에 `keywordOnly` | Modify |
| `app/admin/users/_components/UsersTable.tsx` | 키워드 전용 토글 | Modify |
| `app/admin/users/_components/ColumnSettingsCard.tsx` | 전역 컬럼셋 편집 | Create |
| `app/api/admin/settings/keyword-columns/route.ts` | 컬럼셋 GET/PUT | Create |

---

## Task 1: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/20260608000000_keyword_only_users.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 키워드 전용 사용자 플래그 + 전역 UI 설정(app_config) 테이블

-- 1) app_users.keyword_only
alter table app_users
  add column if not exists keyword_only boolean not null default false;

-- 2) app_config: UI 설정 전용 key-value (secrets용 app_settings와 분리)
create table if not exists app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);

alter table app_config enable row level security;

drop policy if exists "service_role_only" on app_config;
create policy "service_role_only" on app_config
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3) 전역 컬럼셋 기본값 시드 (멱등)
insert into app_config (key, value)
values ('keyword_only_columns', '["keyword","search","category"]'::jsonb)
on conflict (key) do nothing;
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `node scripts/apply-migration.mjs supabase/migrations/20260608000000_keyword_only_users.sql`
(스크립트 인자 규약이 다르면 `node scripts/apply-migration.mjs`의 사용법을 먼저 확인한다. 적용 불가 시 Supabase SQL 에디터에 붙여 실행.)
Expected: 오류 없이 완료. `app_config`에 `keyword_only_columns` 1행.

- [ ] **Step 3: 적용 검증**

Run:
```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const{config}=await import('dotenv');config({path:'.env.local'});const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{data}=await sb.from('app_config').select('*').eq('key','keyword_only_columns').maybeSingle();console.log(JSON.stringify(data));const{data:u}=await sb.from('app_users').select('id,keyword_only').limit(1);console.log(JSON.stringify(u));})"
```
Expected: `keyword_only_columns` 값 `["keyword","search","category"]`, app_users 행에 `keyword_only:false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260608000000_keyword_only_users.sql
git commit -m "feat(db): keyword_only 플래그 + app_config 테이블 추가"
```

---

## Task 2: 컬럼 메타 SSOT + 정규화 (`lib/keyword-columns.ts`)

**Files:**
- Create: `lib/keyword-columns.ts`
- Test: `tests/keyword-columns.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/keyword-columns.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  KEYWORD_COLUMNS,
  DEFAULT_KEYWORD_COLUMNS,
  normalizeColumns,
} from '@/lib/keyword-columns';

describe('KEYWORD_COLUMNS', () => {
  it('does not include the article(원고) column', () => {
    expect(KEYWORD_COLUMNS.some((c) => c.key === 'article')).toBe(false);
  });
  it('keyword column is always-on', () => {
    const kw = KEYWORD_COLUMNS.find((c) => c.key === 'keyword');
    expect(kw?.always).toBe(true);
  });
});

describe('DEFAULT_KEYWORD_COLUMNS', () => {
  it('is keyword/search/category', () => {
    expect(DEFAULT_KEYWORD_COLUMNS).toEqual(['keyword', 'search', 'category']);
  });
});

describe('normalizeColumns', () => {
  it('forces keyword in and preserves meta order', () => {
    expect(normalizeColumns(['category', 'search'])).toEqual(['keyword', 'search', 'category']);
  });
  it('always includes keyword even if absent', () => {
    expect(normalizeColumns(['agency'])).toEqual(['keyword', 'agency']);
  });
  it('drops invalid and the article key', () => {
    expect(normalizeColumns(['article', 'bogus', 'notes'])).toEqual(['keyword', 'notes']);
  });
  it('empty input falls back to keyword only', () => {
    expect(normalizeColumns([])).toEqual(['keyword']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/keyword-columns.test.ts`
Expected: FAIL — "Cannot find module '@/lib/keyword-columns'".

- [ ] **Step 3: 최소 구현 작성**

`lib/keyword-columns.ts`:
```ts
import { supabaseAdmin } from "./supabase";

export type KeywordColumnKey =
  | "keyword"
  | "search"
  | "category"
  | "agency"
  | "published_url"
  | "instagram"
  | "notes";

export type KeywordColumnMeta = {
  key: KeywordColumnKey;
  label: string;
  always?: boolean; // 끌 수 없음(항상 노출)
  default: boolean; // 기본 노출 여부
  selectField?: string; // 키워드 전용 사용자 쿼리 시 select 할 DB 컬럼(없으면 keyword 파생)
};

// 컬럼 단일 출처. 원고(article)는 키워드 전용 사용자에게 영구 비노출이므로 여기 없음.
export const KEYWORD_COLUMNS: KeywordColumnMeta[] = [
  { key: "keyword", label: "키워드", always: true, default: true, selectField: "keyword" },
  { key: "search", label: "검색", default: true },
  { key: "category", label: "분류", default: true, selectField: "category" },
  { key: "agency", label: "계정", default: false, selectField: "agency" },
  { key: "published_url", label: "발행 URL", default: false, selectField: "published_url" },
  { key: "instagram", label: "인스타그램", default: false, selectField: "instagram" },
  { key: "notes", label: "메모", default: false, selectField: "notes" },
];

export const DEFAULT_KEYWORD_COLUMNS: KeywordColumnKey[] = KEYWORD_COLUMNS.filter(
  (c) => c.default,
).map((c) => c.key);

const VALID_KEYS = new Set(KEYWORD_COLUMNS.map((c) => c.key));

// 유효 키만 + keyword 강제 포함 + 메타 순서로 정렬. 무효/원고 키는 제거.
export function normalizeColumns(keys: string[]): KeywordColumnKey[] {
  const picked = new Set<KeywordColumnKey>();
  for (const k of keys) {
    if (VALID_KEYS.has(k as KeywordColumnKey)) picked.add(k as KeywordColumnKey);
  }
  picked.add("keyword");
  return KEYWORD_COLUMNS.filter((c) => picked.has(c.key)).map((c) => c.key);
}

// 전역 컬럼셋을 app_config 에서 로드. 누락/오류 시 기본값.
export async function loadKeywordOnlyColumns(): Promise<KeywordColumnKey[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("app_config")
    .select("value")
    .eq("key", "keyword_only_columns")
    .maybeSingle();
  const raw = data?.value;
  if (Array.isArray(raw)) return normalizeColumns(raw as string[]);
  return DEFAULT_KEYWORD_COLUMNS;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/keyword-columns.test.ts`
Expected: PASS (전부).

- [ ] **Step 5: Commit**

```bash
git add lib/keyword-columns.ts tests/keyword-columns.test.ts
git commit -m "feat: 키워드 컬럼 메타 SSOT + 정규화 헬퍼"
```

---

## Task 3: 권한에 `keywordOnly` 추가 (`lib/permissions.ts`)

**Files:**
- Modify: `lib/permissions.ts`
- Test: `tests/permissions.test.ts`

- [ ] **Step 1: 테스트 헬퍼/케이스 갱신 (실패 유도)**

`tests/permissions.test.ts`의 `mkPerms`에 `keywordOnly` 필드를 추가하고 케이스 1개 추가:
```ts
function mkPerms(over: Partial<UserPermissions> = {}): UserPermissions {
  return {
    userId: 'u1',
    username: 'someone',
    isAdmin: false,
    keywordOnly: false,
    agencies: { mih_speaker: null, mih_casting: null, mih_agency: null, other: null },
    ...over,
  };
}

describe('UserPermissions.keywordOnly', () => {
  it('defaults to false in helper', () => {
    expect(mkPerms().keywordOnly).toBe(false);
  });
  it('can be set true', () => {
    expect(mkPerms({ keywordOnly: true }).keywordOnly).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/permissions.test.ts`
Expected: FAIL — 타입 에러("keywordOnly does not exist on type UserPermissions") 또는 컴파일 실패.

- [ ] **Step 3: `lib/permissions.ts` 수정**

`UserPermissions` 타입에 필드 추가:
```ts
export type UserPermissions = {
  userId: string;
  username: string;
  isAdmin: boolean;
  keywordOnly: boolean;
  agencies: Record<AgencySlug, AgencyRole | null>;
};
```

admin 분기 반환에 `keywordOnly: false` 추가:
```ts
  if (isAdminUsername(username)) {
    return {
      userId,
      username,
      isAdmin: true,
      keywordOnly: false,
      agencies: {
        mih_speaker: "editor",
        mih_casting: "editor",
        mih_agency: "editor",
        other: "editor",
      },
    };
  }
```

일반 분기: `user_agency_permissions` 조회와 함께 `app_users.keyword_only`를 읽어 반환. 기존 일반 분기 끝부분을 다음으로 교체:
```ts
  const sb = supabaseAdmin();
  const [{ data }, { data: urow }] = await Promise.all([
    sb.from("user_agency_permissions").select("agency, role").eq("user_id", userId),
    sb.from("app_users").select("keyword_only").eq("id", userId).maybeSingle(),
  ]);

  const agencies = emptyAgencies();
  for (const r of data ?? []) {
    const agency = r.agency as AgencySlug;
    const role = r.role as AgencyRole;
    if (agency in agencies && (role === "view" || role === "editor")) {
      agencies[agency] = role;
    }
  }
  return { userId, username, isAdmin: false, keywordOnly: !!urow?.keyword_only, agencies };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/permissions.test.ts`
Expected: PASS (전부).

- [ ] **Step 5: Commit**

```bash
git add lib/permissions.ts tests/permissions.test.ts
git commit -m "feat: UserPermissions.keywordOnly 추가"
```

---

## Task 4: 네비게이션·페이지·API 접근 차단

**Files:**
- Modify: `app/layout.tsx`, `app/_components/NavBar.tsx`, `app/page.tsx`, `app/rss/page.tsx`, `app/api/articles/[id]/route.ts`

- [ ] **Step 1: `app/layout.tsx` — keywordOnly 로드 후 NavBar에 전달**

`isAdminUsername` import 옆에 `loadPermissions` 사용. RootLayout 본문을 다음으로 교체:
```tsx
  const user = await verifySession();
  let isAdmin = false;
  let keywordOnly = false;
  if (user) {
    const perms = await loadPermissions(user.id, user.username);
    isAdmin = perms.isAdmin;
    keywordOnly = perms.keywordOnly;
  }
```
import 교체:
```tsx
import { loadPermissions } from "@/lib/permissions";
```
NavBar 렌더:
```tsx
        {user && <NavBar isAdmin={isAdmin} keywordOnly={keywordOnly} />}
```

- [ ] **Step 2: `app/_components/NavBar.tsx` — 링크 제한**

props 타입과 nav를 교체:
```tsx
type Props = { isAdmin: boolean; keywordOnly: boolean };

export default function NavBar({ isAdmin, keywordOnly }: Props) {
```
nav 블록:
```tsx
      <nav className="flex gap-1 ml-1">
        {keywordOnly ? (
          link("/keywords", "키워드")
        ) : (
          <>
            {link("/", "모아보기")}
            {link("/rss", "발행 현황")}
            {link("/keywords", "키워드")}
            {isAdmin && link("/admin/users", "사용자 관리")}
          </>
        )}
      </nav>
```

- [ ] **Step 3: `app/page.tsx` — 키워드 전용 차단**

`const perms = await loadPermissions(...)` 직후에 추가:
```tsx
  if (perms.keywordOnly) redirect("/keywords");
```
(`redirect`는 이미 import됨.)

- [ ] **Step 4: `app/rss/page.tsx` — 세션+키워드 전용 가드 추가**

현재 세션 검사가 없으므로 추가. 상단 import에:
```tsx
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
```
`RssV2Page` 함수 본문 첫 줄(`const sp = await searchParams;` 앞)에:
```tsx
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  if (perms.keywordOnly) redirect("/keywords");
```

- [ ] **Step 5: `app/api/articles/[id]/route.ts` — GET 키워드 전용 차단**

GET 핸들러의 세션 검사 직후에 권한 로드 + 차단을 추가. import에 `loadPermissions` 추가(이미 존재). GET 본문을 교체:
```ts
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const perms = await loadPermissions(session.id, session.username);
  if (perms.keywordOnly) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("articles").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
```

- [ ] **Step 6: 타입체크/빌드 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 7: Commit**

```bash
git add app/layout.tsx app/_components/NavBar.tsx app/page.tsx app/rss/page.tsx "app/api/articles/[id]/route.ts"
git commit -m "feat: 키워드 전용 사용자 페이지/API 접근 차단"
```

---

## Task 5: 키워드 테이블 컬럼 가시성 (`page.tsx` + `KeywordClient`)

**Files:**
- Modify: `app/keywords/page.tsx`, `app/keywords/_components/KeywordClient.tsx`

- [ ] **Step 1: `KeywordClient`에 `visibleColumns` prop 추가 + show() 게이트**

Props 타입 교체:
```tsx
type Props = {
  keywords: Keyword[];
  categories: string[];
  isEditor: boolean;
  visibleColumns: string[] | null; // null = 전체(기존 동작), 배열 = 키워드 전용 컬럼셋
};
```
함수 시그니처:
```tsx
export default function KeywordClient({ keywords, categories, isEditor, visibleColumns }: Props) {
```
컴포넌트 본문 상단(useState 선언들 아래)에 헬퍼 추가:
```tsx
  // visibleColumns=null → 기존 규칙(원고는 isEditor일 때). 배열이면 그 컬럼만(원고 영구 제외).
  const show = (col: string): boolean => {
    if (col === "article") return visibleColumns === null && isEditor;
    if (visibleColumns === null) return true;
    return visibleColumns.includes(col);
  };
  const bodyCols =
    1 + // # 항상
    ["keyword", "search", "article", "category", "agency", "published_url", "instagram", "notes"].filter(show).length;
```

- [ ] **Step 2: colgroup·thead를 show()로 게이트**

`<colgroup>` 교체:
```tsx
            <colgroup>
              <col style={{ width: "2rem" }} />
              {show("keyword") && <col style={{ width: "1%" }} />}
              {show("search") && <col style={{ width: "5rem" }} />}
              {show("article") && <col style={{ width: "11rem" }} />}
              {show("category") && <col style={{ width: "5rem" }} />}
              {show("agency") && <col style={{ width: "8rem" }} />}
              {show("instagram") && <col style={{ width: "12rem" }} />}
              {show("notes") && <col style={{ width: "12rem" }} />}
              {show("published_url") && <col />}
            </colgroup>
```
`<thead>` 내부 `<tr>` 교체:
```tsx
              <tr className="bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
                <th className="px-3 py-1.5 text-right font-medium">#</th>
                {show("keyword") && <th className="px-3 py-1.5 text-left font-medium">키워드</th>}
                {show("search") && <th className="px-3 py-1.5 text-left font-medium">검색</th>}
                {show("article") && <th className="px-3 py-1.5 text-left font-medium">원고</th>}
                {show("category") && <th className="px-3 py-1.5 text-left font-medium">분류</th>}
                {show("agency") && <th className="px-3 py-1.5 text-left font-medium">계정</th>}
                {show("instagram") && <th className="px-3 py-1.5 text-left font-medium">인스타그램</th>}
                {show("notes") && <th className="px-3 py-1.5 text-left font-medium">메모</th>}
                {show("published_url") && <th className="px-3 py-1.5 text-left font-medium">발행 URL</th>}
              </tr>
```

- [ ] **Step 3: tbody 행을 show()로 게이트 + 인스타/메모 셀 추가**

`filtered.map(...)`의 `<tr>` 내부를 다음 순서로 교체(기존 키워드/검색/원고/분류/계정/발행URL 셀을 각각 `show()`로 감싸고, 인스타·메모 셀을 신설):
```tsx
                <tr key={k.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-3 py-1 text-right text-xs text-gray-300 tabular-nums">{idx + 1}</td>
                  {show("keyword") && (
                    <td className="px-3 py-1 font-medium text-gray-800 whitespace-nowrap">{k.keyword}</td>
                  )}
                  {show("search") && (
                    <td className="px-3 py-1">
                      <a
                        href={`https://search.naver.com/search.naver?query=${encodeURIComponent(k.keyword + " 섭외")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors whitespace-nowrap"
                      >
                        검색 ↗
                      </a>
                    </td>
                  )}
                  {show("article") && (
                    <td className="px-3 py-1">
                      {k.article_id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setOpenArticleId(k.article_id!)}
                            className="px-2.5 py-1 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            보기
                          </button>
                          <button
                            onClick={() => navigator.clipboard.writeText(k.article_title ?? "").then(() => toast.success("제목 복사 완료"))}
                            className="px-2.5 py-1 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            제목
                          </button>
                          <button
                            onClick={() => copyBody(k.article_id!)}
                            disabled={copyingId === k.article_id}
                            className="px-2.5 py-1 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50"
                          >
                            {copyingId === k.article_id ? "…" : "본문"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-200 text-xs">—</span>
                      )}
                    </td>
                  )}
                  {show("category") && (
                    <td className="px-3 py-1 text-xs text-gray-400 whitespace-nowrap">{k.category}</td>
                  )}
                  {show("agency") && (
                    <td className="px-3 py-1 text-xs text-gray-400 font-mono whitespace-nowrap">{k.agency ?? ""}</td>
                  )}
                  {show("instagram") && (
                    <td className="px-3 py-1 text-xs">
                      {k.instagram ? (
                        <a href={k.instagram} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate block" title={k.instagram}>
                          {k.instagram.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                  )}
                  {show("notes") && (
                    <td className="px-3 py-1 text-xs text-gray-500 whitespace-pre-wrap">{k.notes ?? ""}</td>
                  )}
                  {show("published_url") && (
                    <td className="px-3 py-1">
                      {k.published_url ? (
                        <a
                          href={k.published_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-emerald-600 hover:underline truncate block"
                          title={k.published_url}
                        >
                          {k.published_url.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        <span className="text-gray-200 text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
```
빈 상태 행의 `colSpan`을 교체:
```tsx
                  <td colSpan={bodyCols} className="py-10 text-center text-sm text-gray-300">
                    키워드가 없습니다.
                  </td>
```

- [ ] **Step 4: `app/keywords/page.tsx` — 컬럼셋 계산 + 동적 select + prop 전달**

import 추가:
```tsx
import { loadPermissions } from "@/lib/permissions";
import { loadKeywordOnlyColumns, KEYWORD_COLUMNS } from "@/lib/keyword-columns";
```
(`loadPermissions`는 이미 import되어 있으면 중복 추가하지 않는다.)

함수에서 `isEditor` 계산 직후, keyword_only면 컬럼셋과 동적 select를 준비:
```tsx
  const keywordOnly = perms.keywordOnly;
  const visibleColumns = keywordOnly ? await loadKeywordOnlyColumns() : null;

  // 키워드 전용 사용자는 노출 컬럼에 해당하는 DB 필드만 select (id/keyword/category는 항상)
  const selectFields = (() => {
    if (!visibleColumns) return "id,keyword,category,notes,instagram,agency,published_url,created_at";
    const fields = new Set<string>(["id", "keyword", "category"]);
    for (const col of visibleColumns) {
      const meta = KEYWORD_COLUMNS.find((c) => c.key === col);
      if (meta?.selectField) fields.add(meta.selectField);
    }
    return [...fields].join(",");
  })();
```
`keywords` 쿼리의 `.select(...)`를 `selectFields`로 교체:
```tsx
    sb
      .from("keywords")
      .select(selectFields)
      .order("category")
      .order("keyword"),
```
keyword_only 사용자는 articles 조인이 불필요하므로 articles 쿼리도 게이트:
```tsx
  const [kwRes, artRes] = await Promise.all([
    sb.from("keywords").select(selectFields).order("category").order("keyword"),
    keywordOnly
      ? Promise.resolve({ data: [], error: null })
      : sb.from("articles").select("id,person_name,title,published_url,agency"),
  ]);
```
`keywords` 매핑은 누락 필드를 안전하게 채우도록 보정(선택 안 된 필드는 undefined → null/기본):
```tsx
  const keywords: Keyword[] = (kwRes.data ?? []).map((k: Record<string, unknown>) => {
    const name = k.keyword as string;
    const art = articleMap.get(name);
    return {
      id: k.id as string,
      keyword: name,
      category: (k.category as string) ?? "",
      notes: (k.notes as string | null) ?? null,
      instagram: (k.instagram as string | null) ?? null,
      created_at: (k.created_at as string) ?? "",
      agency: (k.agency as string | null) ?? art?.agency ?? null,
      published_url: (k.published_url as string | null) ?? art?.published_url ?? null,
      has_article: !!art,
      article_id: art?.id ?? null,
      article_title: art?.title ?? null,
    };
  });
```
마지막으로 `<KeywordClient ... />`에 prop 추가:
```tsx
      <KeywordClient keywords={keywords} categories={categories} isEditor={isEditor} visibleColumns={visibleColumns} />
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음. (`KeywordClient` 호출부에 `visibleColumns` 누락 시 에러로 검출됨.)

- [ ] **Step 6: 수동 확인 (dev)**

Run: `npm run dev` 후, 일반 admin으로 `/keywords` 접속 → 컬럼 전부(원고 포함) 그대로인지 확인.
Expected: 회귀 없음. (키워드 전용 사용자 동작은 Task 7에서 토글 생성 후 확인.)

- [ ] **Step 7: Commit**

```bash
git add app/keywords/page.tsx app/keywords/_components/KeywordClient.tsx
git commit -m "feat: 키워드 테이블 컬럼 가시성(visibleColumns) 지원"
```

---

## Task 6: 컬럼셋 관리 API (`/api/admin/settings/keyword-columns`)

**Files:**
- Create: `app/api/admin/settings/keyword-columns/route.ts`

- [ ] **Step 1: route 작성**

```ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/api-guards";
import { loadKeywordOnlyColumns, normalizeColumns } from "@/lib/keyword-columns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.response;
  const columns = await loadKeywordOnlyColumns();
  return NextResponse.json({ columns });
}

export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  let body: { columns?: unknown };
  try {
    body = (await req.json()) as { columns?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.columns)) {
    return NextResponse.json({ error: "columns must be an array" }, { status: 400 });
  }
  const columns = normalizeColumns(body.columns.map(String));

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("app_config")
    .upsert(
      { key: "keyword_only_columns", value: columns, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ columns });
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 동작 확인 (dev, admin 세션 쿠키 필요)**

dev 서버에서 admin 로그인 후 브라우저 콘솔:
```js
await fetch('/api/admin/settings/keyword-columns').then(r=>r.json())
```
Expected: `{ columns: ["keyword","search","category"] }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/settings/keyword-columns/route.ts
git commit -m "feat(api): 전역 키워드 컬럼셋 GET/PUT"
```

---

## Task 7: 관리 UI — 키워드 전용 토글 + 컬럼셋 카드

**Files:**
- Modify: `app/admin/users/page.tsx`, `app/api/admin/users/[id]/route.ts`, `app/api/admin/users/route.ts`, `app/admin/users/_components/UsersTable.tsx`
- Create: `app/admin/users/_components/ColumnSettingsCard.tsx`

- [ ] **Step 1: `AdminUserRow`에 `keywordOnly` 추가 + 로드 (`app/admin/users/page.tsx`)**

타입 교체:
```tsx
export type AdminUserRow = {
  id: string;
  username: string;
  isAdmin: boolean;
  keywordOnly: boolean;
  permissions: Record<AgencySlug, AgencyRole | null>;
};
```
users 조회에 `keyword_only` 컬럼 포함:
```tsx
    sb.from("app_users").select("id, username, created_at, keyword_only").order("created_at"),
```
rows 매핑에 필드 추가:
```tsx
  const rows: AdminUserRow[] = (usersRes.data ?? []).map((u) => ({
    id: u.id,
    username: u.username,
    isAdmin: isAdminUsername(u.username),
    keywordOnly: !!(u as { keyword_only?: boolean }).keyword_only,
    permissions: byUser.get(u.id) ?? emptyPerms(),
  }));
```
컬럼셋 초기값을 로드해 UsersTable 위에 카드로 전달. import 추가:
```tsx
import { loadKeywordOnlyColumns } from "@/lib/keyword-columns";
import ColumnSettingsCard from "./_components/ColumnSettingsCard";
```
`UsersTable` 렌더 전에 컬럼셋 로드:
```tsx
  const keywordColumns = await loadKeywordOnlyColumns();
```
return JSX에서 제목 아래에 카드 삽입:
```tsx
        <h1 className="text-lg font-bold mb-4">사용자 관리</h1>
        <ColumnSettingsCard initialColumns={keywordColumns} />
        <UsersTable initialUsers={rows} currentUserId={user.id} />
```

- [ ] **Step 2: PATCH에 `keyword_only` 처리 (`app/api/admin/users/[id]/route.ts`)**

`PatchBody` 타입 확장:
```ts
type PatchBody = { password?: string; permissions?: Permissions; keyword_only?: boolean };
```
admin 보호 분기 아래(권한/비번 처리 사이 적절한 위치)에 추가:
```ts
  if (body.keyword_only !== undefined) {
    if (isAdminUsername(target.username)) {
      return NextResponse.json({ error: "cannot set keyword_only on admin" }, { status: 400 });
    }
    const { error } = await sb
      .from("app_users")
      .update({ keyword_only: !!body.keyword_only })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
```

- [ ] **Step 3: GET 응답에 `keywordOnly` 포함 (`app/api/admin/users/route.ts`)**

users 조회에 컬럼 추가:
```ts
    sb.from("app_users").select("id, username, created_at, keyword_only").order("created_at"),
```
응답 매핑에 필드 추가:
```ts
  const users = (usersRes.data ?? []).map((u) => ({
    id: u.id,
    username: u.username,
    isAdmin: isAdminUsername(u.username),
    keywordOnly: !!(u as { keyword_only?: boolean }).keyword_only,
    permissions: byUser.get(u.id) ?? emptyPerms(),
  }));
```
(POST 신규 사용자 응답은 `keywordOnly: false` 추가:)
```ts
        isAdmin: isAdminUsername(created.username),
        keywordOnly: false,
        permissions: { ...emptyPerms(), ...perms },
```

- [ ] **Step 4: `UsersTable`에 키워드 전용 토글 추가**

`setRole` 함수 아래에 토글 핸들러 추가:
```tsx
  async function setKeywordOnly(user: AdminUserRow, next: boolean) {
    const prev = user.keywordOnly;
    setUsers((cur) => cur.map((u) => (u.id === user.id ? { ...u, keywordOnly: next } : u)));
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword_only: next }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "request failed" }));
      toast.error(`저장 실패: ${error}`);
      setUsers((cur) => cur.map((u) => (u.id === user.id ? { ...u, keywordOnly: prev } : u)));
    } else {
      toast.success("저장됨");
    }
  }
```
thead에 "키워드 전용" 헤더를 작업 헤더 앞에 추가:
```tsx
            <th className="text-left px-3 py-2 w-24">키워드 전용</th>
            <th className="text-left px-3 py-2 w-24">작업</th>
```
tbody에서 agency 셀들 뒤, 작업 셀 앞에 토글 셀 추가:
```tsx
              <td className="px-3 py-2">
                {u.isAdmin ? (
                  <span className="text-xs text-gray-400">—</span>
                ) : (
                  <input
                    type="checkbox"
                    checked={u.keywordOnly}
                    onChange={(e) => setKeywordOnly(u, e.target.checked)}
                  />
                )}
              </td>
```

- [ ] **Step 5: `ColumnSettingsCard` 생성**

`app/admin/users/_components/ColumnSettingsCard.tsx`:
```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KEYWORD_COLUMNS, type KeywordColumnKey } from "@/lib/keyword-columns";

export default function ColumnSettingsCard({ initialColumns }: { initialColumns: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialColumns));
  const [saving, setSaving] = useState(false);

  function toggle(key: KeywordColumnKey, always: boolean | undefined) {
    if (always) return; // keyword 등 고정 컬럼
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const columns = KEYWORD_COLUMNS.filter((c) => c.always || selected.has(c.key)).map((c) => c.key);
    const res = await fetch("/api/admin/settings/keyword-columns", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columns }),
    });
    setSaving(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "request failed" }));
      toast.error(`저장 실패: ${error}`);
    } else {
      toast.success("컬럼 설정 저장됨");
    }
  }

  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-lg p-3 mb-4">
      <div className="text-sm font-semibold text-gray-700 mb-2">키워드 전용 사용자 노출 컬럼 (전역)</div>
      <div className="flex flex-wrap gap-3">
        {KEYWORD_COLUMNS.map((c) => (
          <label key={c.key} className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={c.always || selected.has(c.key)}
              disabled={c.always}
              onChange={() => toggle(c.key, c.always)}
            />
            {c.label}
            {c.always && <span className="text-xs text-gray-400">(고정)</span>}
          </label>
        ))}
      </div>
      <div className="mt-3">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "저장 중…" : "컬럼 설정 저장"}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 타입체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 7: 엔드투엔드 수동 확인 (dev)**

1. admin 로그인 → `/admin/users` → 임의 비-admin 사용자의 "키워드 전용" 체크.
2. 컬럼 설정 카드에서 "계정" 체크 후 저장.
3. 해당 사용자로 로그인 → 네비게이션에 "키워드"만 보임. `/` 또는 `/rss` 직접 접근 시 `/keywords`로 리다이렉트.
4. `/keywords` 테이블에 키워드/검색/분류/계정만, **원고 컬럼 없음**.

Expected: 위 동작 모두 충족.

- [ ] **Step 8: Commit**

```bash
git add app/admin/users/page.tsx "app/api/admin/users/[id]/route.ts" app/api/admin/users/route.ts app/admin/users/_components/UsersTable.tsx app/admin/users/_components/ColumnSettingsCard.tsx
git commit -m "feat: 관리 UI — 키워드 전용 토글 + 전역 컬럼셋 편집"
```

---

## Task 8: 전체 검증 + 최종 커밋

- [ ] **Step 1: 전체 테스트**

Run: `npx vitest run`
Expected: 전부 PASS (`keyword-columns`, `permissions` 포함).

- [ ] **Step 2: 타입체크 + 프로덕션 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 오류 없이 빌드 성공.

- [ ] **Step 3: (필요 시) 잔여 변경 커밋 후 푸시**

```bash
git status
git push origin main
```

---

## 자기 검토 메모 (작성자 확인 완료)

- **스펙 커버리지:** 키워드 전용 플래그(Task 1,3,7), 페이지 차단(Task 4), 컬럼 가시성/원고 제외(Task 2,5), 전역 컬럼셋 저장(Task 1,6), 관리 UI(Task 7), 서버측 강제 select(Task 5 Step 4), 원고 API 차단(Task 4 Step 5), 테스트(Task 2,3) — 전 항목 매핑됨.
- **타입 일관성:** `visibleColumns: string[] | null`은 page.tsx(생성)·KeywordClient(소비) 동일. `keywordOnly`는 permissions·layout·page·admin row 전반 동일 명명. `normalizeColumns`/`loadKeywordOnlyColumns` 시그니처 task 간 일치.
- **플레이스홀더:** 없음(모든 코드 스텝에 실제 코드 포함).
