# 사용자별 Agency 권한 시스템 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자별로 3개 agency(`mih_speaker`/`mih_casting`/`mih_agency`)에 대해 `view`/`editor` 권한을 매트릭스로 부여하고, admin이 `/admin/users` 페이지에서 관리할 수 있게 한다.

**Architecture:** 새 테이블 `user_agency_permissions`(composite PK + service_role RLS) + `ADMIN_USERNAMES` env. 서버 데이터 페치(`/app/page.tsx`)에서 articles를 권한으로 필터, mutation API에서 가드, 클라이언트 UI에서 보이지 않는 컬럼/편집 UI 숨김. Admin은 `/admin/users` 테이블에서 인라인 드롭다운으로 권한을 즉시 토글.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase service_role, Vitest, Tailwind, base-ui 컴포넌트.

**Spec:** `docs/superpowers/specs/2026-05-25-user-permissions-design.md`

---

## 파일 구조

**신규**
- `supabase/migrations/20260525000000_user_agency_permissions.sql` — 테이블 + RLS + 시드 권한
- `lib/permissions.ts` — 권한 평가 헬퍼 + 순수 함수
- `lib/api-guards.ts` — `requireSession`, `requireEditor`, `requireAdmin` (API 라우트용)
- `app/admin/users/page.tsx` — admin 서버 컴포넌트
- `app/admin/users/_components/UsersTable.tsx` — 권한 매트릭스 인라인 편집 테이블
- `app/admin/users/_components/NewUserModal.tsx` — 새 사용자 생성 폼
- `app/admin/users/_components/PasswordModal.tsx` — 비밀번호 변경 폼
- `app/api/admin/users/route.ts` — GET, POST
- `app/api/admin/users/[id]/route.ts` — PATCH, DELETE
- `tests/permissions.test.ts` — 권한 헬퍼 유닛 테스트

**수정**
- `app/page.tsx` — 권한 로드 후 visible agency로 articles 필터, perms를 DashboardClient에 전달
- `app/_components/DashboardClient.tsx` — perms prop, 권한 없는 컬럼/필터링
- `app/_components/KanbanBoard.tsx` — visible agency만 렌더
- `app/_components/TopBar.tsx` — admin이면 "사용자 관리" 링크
- `app/_components/ArticleModalMeta.tsx` — canEdit=false 시 read-only 모드
- `app/api/articles/[id]/route.ts` — PATCH에 editor 가드 추가

---

## Task 1: 마이그레이션 작성

**Files:**
- Create: `supabase/migrations/20260525000000_user_agency_permissions.sql`

- [ ] **Step 1: SQL 파일 생성**

```sql
-- 사용자별 agency 권한 매트릭스
-- row 존재 = 해당 agency에 대해 view 또는 editor 권한
-- row 없음 = 권한 없음 (UI에서 컬럼 자체 미노출)

create table if not exists user_agency_permissions (
  user_id    uuid not null references app_users(id) on delete cascade,
  agency     text not null check (agency in ('mih_speaker','mih_casting','mih_agency')),
  role       text not null check (role in ('view','editor')),
  granted_at timestamptz default now(),
  primary key (user_id, agency)
);

create index if not exists user_agency_permissions_user_idx
  on user_agency_permissions (user_id);

alter table user_agency_permissions enable row level security;

create policy "service_role_only" on user_agency_permissions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 기존 시드 사용자에게 3개 agency editor 권한 부여 (멱등)
insert into user_agency_permissions (user_id, agency, role)
select u.id, a.agency, 'editor'
from app_users u
cross join (values ('mih_speaker'),('mih_casting'),('mih_agency')) as a(agency)
where u.username = 'bpark0718'
on conflict (user_id, agency) do nothing;
```

- [ ] **Step 2: 마이그레이션 적용 (Supabase MCP)**

`mcp__plugin_supabase_supabase__apply_migration` 도구로 위 SQL을 `name=user_agency_permissions`로 적용.
실패 시: 이미 존재한다는 메시지는 무시(멱등). 다른 에러는 SQL 검토.

- [ ] **Step 3: 적용 검증**

```sql
select count(*) from user_agency_permissions;
```

`mcp__plugin_supabase_supabase__execute_sql` 도구로 실행.
Expected: `bpark0718`이 시드되어 있으면 3 (3개 agency), 아니면 0.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260525000000_user_agency_permissions.sql
git commit -m "feat(permissions): user_agency_permissions 테이블 추가"
```

---

## Task 2: 권한 헬퍼 + 테스트 (`lib/permissions.ts`)

**Files:**
- Create: `lib/permissions.ts`
- Create: `tests/permissions.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/permissions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isAdminUsername,
  canView,
  canEdit,
  visibleAgencies,
  type UserPermissions,
} from '@/lib/permissions';

function mkPerms(over: Partial<UserPermissions> = {}): UserPermissions {
  return {
    userId: 'u1',
    username: 'someone',
    isAdmin: false,
    agencies: { mih_speaker: null, mih_casting: null, mih_agency: null },
    ...over,
  };
}

describe('isAdminUsername', () => {
  const original = process.env.ADMIN_USERNAMES;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_USERNAMES;
    else process.env.ADMIN_USERNAMES = original;
  });

  it('returns true for default admin when env unset', () => {
    delete process.env.ADMIN_USERNAMES;
    expect(isAdminUsername('bpark0718')).toBe(true);
    expect(isAdminUsername('other')).toBe(false);
  });

  it('uses ADMIN_USERNAMES env (comma separated)', () => {
    process.env.ADMIN_USERNAMES = 'alice, bob ,charlie';
    expect(isAdminUsername('alice')).toBe(true);
    expect(isAdminUsername('bob')).toBe(true);
    expect(isAdminUsername('charlie')).toBe(true);
    expect(isAdminUsername('bpark0718')).toBe(false);
  });
});

describe('canView', () => {
  it('returns true when agency role is view', () => {
    const p = mkPerms({ agencies: { mih_speaker: 'view', mih_casting: null, mih_agency: null } });
    expect(canView(p, 'mih_speaker')).toBe(true);
  });

  it('returns true when agency role is editor', () => {
    const p = mkPerms({ agencies: { mih_speaker: 'editor', mih_casting: null, mih_agency: null } });
    expect(canView(p, 'mih_speaker')).toBe(true);
  });

  it('returns false when agency role is null', () => {
    const p = mkPerms();
    expect(canView(p, 'mih_speaker')).toBe(false);
  });
});

describe('canEdit', () => {
  it('returns true only for editor', () => {
    const p = mkPerms({ agencies: { mih_speaker: 'editor', mih_casting: 'view', mih_agency: null } });
    expect(canEdit(p, 'mih_speaker')).toBe(true);
    expect(canEdit(p, 'mih_casting')).toBe(false);
    expect(canEdit(p, 'mih_agency')).toBe(false);
  });
});

describe('visibleAgencies', () => {
  it('returns only agencies with non-null role', () => {
    const p = mkPerms({ agencies: { mih_speaker: 'view', mih_casting: null, mih_agency: 'editor' } });
    expect(visibleAgencies(p)).toEqual(['mih_speaker', 'mih_agency']);
  });

  it('returns empty when no permissions', () => {
    expect(visibleAgencies(mkPerms())).toEqual([]);
  });

  it('preserves AGENCY_SLUGS order', () => {
    const p = mkPerms({ agencies: { mih_speaker: 'view', mih_casting: 'view', mih_agency: 'view' } });
    expect(visibleAgencies(p)).toEqual(['mih_speaker', 'mih_casting', 'mih_agency']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- tests/permissions.test.ts`
Expected: FAIL — `@/lib/permissions` 모듈 없음.

- [ ] **Step 3: `lib/permissions.ts` 구현**

```ts
import { supabaseAdmin } from "./supabase";
import { AGENCY_SLUGS, type AgencySlug } from "./agencies";

export type AgencyRole = "view" | "editor";

export type UserPermissions = {
  userId: string;
  username: string;
  isAdmin: boolean;
  agencies: Record<AgencySlug, AgencyRole | null>;
};

export function isAdminUsername(username: string): boolean {
  const raw = process.env.ADMIN_USERNAMES ?? "bpark0718";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(username);
}

function emptyAgencies(): UserPermissions["agencies"] {
  return { mih_speaker: null, mih_casting: null, mih_agency: null };
}

export async function loadPermissions(
  userId: string,
  username: string,
): Promise<UserPermissions> {
  if (isAdminUsername(username)) {
    return {
      userId,
      username,
      isAdmin: true,
      agencies: {
        mih_speaker: "editor",
        mih_casting: "editor",
        mih_agency: "editor",
      },
    };
  }

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("user_agency_permissions")
    .select("agency, role")
    .eq("user_id", userId);

  const agencies = emptyAgencies();
  for (const r of data ?? []) {
    const agency = r.agency as AgencySlug;
    const role = r.role as AgencyRole;
    if (agency in agencies && (role === "view" || role === "editor")) {
      agencies[agency] = role;
    }
  }
  return { userId, username, isAdmin: false, agencies };
}

export function visibleAgencies(p: UserPermissions): AgencySlug[] {
  return AGENCY_SLUGS.filter((a) => p.agencies[a] !== null);
}

export function canView(p: UserPermissions, a: AgencySlug): boolean {
  return p.agencies[a] !== null;
}

export function canEdit(p: UserPermissions, a: AgencySlug): boolean {
  return p.agencies[a] === "editor";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- tests/permissions.test.ts`
Expected: 모든 테스트 PASS (9개 정도).

- [ ] **Step 5: 커밋**

```bash
git add lib/permissions.ts tests/permissions.test.ts
git commit -m "feat(permissions): 권한 평가 헬퍼 + 유닛 테스트"
```

---

## Task 3: API 가드 헬퍼 (`lib/api-guards.ts`)

**Files:**
- Create: `lib/api-guards.ts`

- [ ] **Step 1: 헬퍼 구현**

```ts
import { NextResponse } from "next/server";
import { verifySession, type SessionUser } from "./auth";
import { loadPermissions, canEdit, type UserPermissions } from "./permissions";
import type { AgencySlug } from "./agencies";

export type GuardSuccess = { ok: true; user: SessionUser; perms: UserPermissions };
export type GuardFailure = { ok: false; response: NextResponse };
export type GuardResult = GuardSuccess | GuardFailure;

function unauth(): GuardFailure {
  return { ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
}

function forbid(reason: string): GuardFailure {
  return { ok: false, response: NextResponse.json({ error: reason }, { status: 403 }) };
}

export async function requireSession(): Promise<GuardResult> {
  const user = await verifySession();
  if (!user) return unauth();
  const perms = await loadPermissions(user.id, user.username);
  return { ok: true, user, perms };
}

export async function requireAdmin(): Promise<GuardResult> {
  const r = await requireSession();
  if (!r.ok) return r;
  if (!r.perms.isAdmin) return forbid("admin only");
  return r;
}

export async function requireEditor(agency: AgencySlug): Promise<GuardResult> {
  const r = await requireSession();
  if (!r.ok) return r;
  if (!canEdit(r.perms, agency)) return forbid(`no edit permission for ${agency}`);
  return r;
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add lib/api-guards.ts
git commit -m "feat(permissions): API 가드 헬퍼 추가"
```

---

## Task 4: `app/page.tsx` — 권한 기반 articles 필터

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 현재 파일 읽기 (컨텍스트 회복)**

Read `app/page.tsx` 전체.

- [ ] **Step 2: 권한 로드 + visible 필터 적용**

전체 파일을 다음으로 교체:

```tsx
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions, visibleAgencies } from "@/lib/permissions";
import { groupArticlesForKanban, computeKpis, type ArticleRow } from "@/lib/articles";
import { isAgencySlug } from "@/lib/agencies";
import DashboardClient from "./_components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardV2Page() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  const visible = visibleAgencies(perms);

  const sb = supabaseAdmin();
  const [articlesRes, unmatchedRes] = await Promise.all([
    sb
      .from("articles")
      .select(
        "id,publish_date,agency,slug,person_name,title,source_path,instagram_url,category,notes,created_at,updated_at,published_at,published_url,published_source",
      )
      .in("agency", visible.length > 0 ? visible : ["__none__"])
      .order("created_at", { ascending: false }),
    sb.from("unmatched_rss_items").select("agency", { count: "exact", head: true }),
  ]);

  if (articlesRes.error) {
    return <main className="p-6 text-red-700">DB 조회 실패: {articlesRes.error.message}</main>;
  }

  const articles = ((articlesRes.data || []) as ArticleRow[]).filter((a) => isAgencySlug(a.agency));
  const groups = groupArticlesForKanban(articles);
  const kpis = computeKpis(articles, unmatchedRes.count ?? 0);

  return (
    <DashboardClient
      groups={groups}
      kpis={kpis}
      generatedAt={new Date().toISOString()}
      perms={perms}
    />
  );
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `DashboardClient` props에 `perms`가 아직 없어서 에러 — Task 5에서 수정 예정. 다른 에러는 없어야 함.

- [ ] **Step 4: 커밋 (Task 5 종료 후 함께)**

이 task는 Task 5 완료 후 같이 커밋.

---

## Task 5: `DashboardClient` + `KanbanBoard` — perms prop 반영

**Files:**
- Modify: `app/_components/DashboardClient.tsx`
- Modify: `app/_components/KanbanBoard.tsx`

- [ ] **Step 1: 현재 KanbanBoard 읽기**

Read `app/_components/KanbanBoard.tsx`.

- [ ] **Step 2: DashboardClient에 perms prop 추가**

`app/_components/DashboardClient.tsx`에서:

기존:
```ts
import type { KanbanGroups, KanbanKpis, ArticleRow } from "@/lib/articles";
```

수정:
```ts
import type { KanbanGroups, KanbanKpis, ArticleRow } from "@/lib/articles";
import type { UserPermissions } from "@/lib/permissions";
```

기존:
```ts
type Props = {
  groups: KanbanGroups;
  kpis: KanbanKpis;
  generatedAt: string;
};
```

수정:
```ts
type Props = {
  groups: KanbanGroups;
  kpis: KanbanKpis;
  generatedAt: string;
  perms: UserPermissions;
};
```

기존:
```ts
export default function DashboardClient({ groups, kpis, generatedAt }: Props) {
```

수정:
```ts
export default function DashboardClient({ groups, kpis, generatedAt, perms }: Props) {
```

기존 `<TopBar generatedAt={generatedAt} />`를:
```tsx
<TopBar generatedAt={generatedAt} isAdmin={perms.isAdmin} />
```

기존 `<KanbanBoard groups={filteredGroups} onOpen={openModal} />`를:
```tsx
<KanbanBoard groups={filteredGroups} onOpen={openModal} perms={perms} />
```

기존 `<ArticleModal articleId={openId} onClose={closeModal} onNeighbor={navigate} />`를:
```tsx
<ArticleModal articleId={openId} onClose={closeModal} onNeighbor={navigate} perms={perms} />
```

- [ ] **Step 3: KanbanBoard가 권한 없는 컬럼을 숨기도록 수정**

`app/_components/KanbanBoard.tsx`에서:
- import에 `import { visibleAgencies, type UserPermissions } from "@/lib/permissions";` 추가
- Props 타입에 `perms: UserPermissions` 추가
- 컴포넌트 본문에서 AGENCY_SLUGS를 직접 순회하던 부분을 `visibleAgencies(perms)`로 교체

기존 코드가 무엇이든 — 핵심 패턴은:
```tsx
{AGENCY_SLUGS.map((agency) => (
  <KanbanColumn ... />
))}
```
이를:
```tsx
{visibleAgencies(perms).map((agency) => (
  <KanbanColumn ... />
))}
```
로 교체. AGENCY_SLUGS import는 더 이상 필요 없으면 제거.

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `TopBar`/`ArticleModal`이 새 prop을 받지 못해 에러 — Task 6, 7에서 수정. KanbanBoard 관련 에러는 없어야 함.

- [ ] **Step 5: 커밋 (Task 7 후 함께 — 일단 진행)**

---

## Task 6: `TopBar` — admin 링크 노출

**Files:**
- Modify: `app/_components/TopBar.tsx`

- [ ] **Step 1: Props 확장 + 링크 추가**

전체 파일을 다음으로 교체:

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = { generatedAt: string; isAdmin: boolean };

export default function TopBar({ generatedAt, isAdmin }: Props) {
  return (
    <header className="flex items-center gap-3 bg-white border-b border-[color:var(--color-border)] px-4 py-2.5">
      <div className="text-sm font-bold text-[color:var(--color-primary)]">MIH</div>
      <nav className="flex gap-1 ml-2">
        <Link
          href="/"
          className="px-3 py-1 text-sm rounded bg-blue-50 text-[color:var(--color-primary)] font-semibold"
        >
          모아보기
        </Link>
        <Link
          href="/rss"
          className="px-3 py-1 text-sm rounded text-gray-600 hover:bg-gray-50"
        >
          발행 현황
        </Link>
        {isAdmin && (
          <Link
            href="/admin/users"
            className="px-3 py-1 text-sm rounded text-gray-600 hover:bg-gray-50"
          >
            사용자 관리
          </Link>
        )}
      </nav>
      <div className="flex-1" />
      <div className="text-xs text-[color:var(--color-text-muted)]">
        데이터 {generatedAt.slice(0, 16).replace("T", " ")}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await fetch("/api/auth/logout", { method: "POST" });
          location.href = "/login";
        }}
      >
        <Button type="submit" variant="outline" size="sm">
          로그아웃
        </Button>
      </form>
    </header>
  );
}
```

- [ ] **Step 2: 다른 TopBar 호출처 확인**

Run (PowerShell): Grep for `<TopBar` across `app/**/*.tsx`.
- `app/rss/page.tsx`나 다른 곳에서 `<TopBar generatedAt=...>`를 호출하면 isAdmin도 넘기도록 수정. 권한 컨텍스트 없는 곳이면 `verifySession + isAdminUsername(user.username)`만 검사해서 전달.

해당 호출처가 있으면 각각 다음 패턴으로 수정:
```tsx
// 서버 컴포넌트에서
const user = await verifySession();
const isAdmin = user ? isAdminUsername(user.username) : false;
return <TopBar generatedAt={...} isAdmin={isAdmin} />;
```
import: `import { isAdminUsername } from "@/lib/permissions";`

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: TopBar 관련 에러 해결. `ArticleModal`만 남음.

---

## Task 7: `ArticleModal` / `ArticleModalMeta` — read-only 모드

**Files:**
- Modify: `app/_components/ArticleModal.tsx`
- Modify: `app/_components/ArticleModalMeta.tsx`

- [ ] **Step 1: 현재 파일 읽기**

Read 두 파일 전체.

- [ ] **Step 2: ArticleModal이 perms를 받아 ArticleModalMeta에 canEdit를 내려보내도록 수정**

`ArticleModal.tsx`:
- import에 `import { canEdit, type UserPermissions } from "@/lib/permissions";` 추가
- Props 타입에 `perms: UserPermissions` 추가
- 컴포넌트가 article 데이터를 받은 시점에서 `const editable = canEdit(perms, article.agency);` 계산
- `<ArticleModalMeta ... />`에 `editable={editable}` prop 전달

`ArticleModalMeta.tsx`:
- Props 타입에 `editable: boolean` 추가
- 컴포넌트 내부에서 `editable === false`일 때:
  - 모든 `<Input>` / `<Textarea>` / `<Select>`에 `disabled={!editable}` 추가
  - 저장 버튼 자체를 `{editable && <Button ...>저장</Button>}` 패턴으로 조건부 렌더
  - "발행 표시" 등 상태 변경 버튼도 동일하게 `editable && ...`로 가림

구체 코드는 현재 파일 구조에 따라 다름. 핵심은 **모든 mutation UI가 editable=false일 때 사라지거나 disabled되어야 함**.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 4: 통합 커밋 (Task 4~7)**

```bash
git add app/page.tsx app/_components/DashboardClient.tsx app/_components/KanbanBoard.tsx app/_components/TopBar.tsx app/_components/ArticleModal.tsx app/_components/ArticleModalMeta.tsx
git commit -m "feat(permissions): 권한 기반 칸반 컬럼/모달 가시성 적용"
```

(추가로 다른 TopBar 호출처가 있어 수정됐다면 함께 add.)

---

## Task 8: `articles/[id]` PATCH API에 editor 가드

**Files:**
- Modify: `app/api/articles/[id]/route.ts`

- [ ] **Step 1: PATCH에 가드 추가**

기존 PATCH 핸들러를 다음과 같이 수정 (GET은 유지):

```ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions, canEdit } from "@/lib/permissions";
import { isAgencySlug } from "@/lib/agencies";

// ... GET 그대로 ...

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const sb = supabaseAdmin();

  // 대상 article의 agency를 먼저 확인해서 editor 권한 체크
  const { data: existing, error: fetchErr } = await sb
    .from("articles")
    .select("agency")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isAgencySlug(existing.agency)) {
    return NextResponse.json({ error: "invalid agency" }, { status: 500 });
  }

  const perms = await loadPermissions(session.id, session.username);
  if (!canEdit(perms, existing.agency)) {
    return NextResponse.json({ error: "no edit permission" }, { status: 403 });
  }

  // ... 이하 기존 body 파싱 / update 로직 그대로 ...
}
```

기존 body 파싱~update 로직은 그대로 유지. 가드만 앞에 끼워넣음.

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/api/articles/\[id\]/route.ts
git commit -m "feat(permissions): articles PATCH에 editor 가드 추가"
```

---

## Task 9: Admin API — GET, POST `/api/admin/users`

**Files:**
- Create: `app/api/admin/users/route.ts`

- [ ] **Step 1: 핸들러 작성**

```ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/api-guards";
import { isAdminUsername, type AgencyRole } from "@/lib/permissions";
import { AGENCY_SLUGS, isAgencySlug, type AgencySlug } from "@/lib/agencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Permissions = Partial<Record<AgencySlug, AgencyRole | null>>;
type PostBody = { username?: string; password?: string; permissions?: Permissions };

function emptyPerms(): Record<AgencySlug, AgencyRole | null> {
  return { mih_speaker: null, mih_casting: null, mih_agency: null };
}

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const sb = supabaseAdmin();
  const [usersRes, permsRes] = await Promise.all([
    sb.from("app_users").select("id, username, created_at").order("created_at"),
    sb.from("user_agency_permissions").select("user_id, agency, role"),
  ]);
  if (usersRes.error) return NextResponse.json({ error: usersRes.error.message }, { status: 500 });
  if (permsRes.error) return NextResponse.json({ error: permsRes.error.message }, { status: 500 });

  const byUser = new Map<string, Record<AgencySlug, AgencyRole | null>>();
  for (const u of usersRes.data ?? []) byUser.set(u.id, emptyPerms());
  for (const r of permsRes.data ?? []) {
    const agency = r.agency as AgencySlug;
    const role = r.role as AgencyRole;
    const map = byUser.get(r.user_id as string);
    if (map && isAgencySlug(agency)) map[agency] = role;
  }

  const users = (usersRes.data ?? []).map((u) => ({
    id: u.id,
    username: u.username,
    isAdmin: isAdminUsername(u.username),
    permissions: byUser.get(u.id) ?? emptyPerms(),
  }));

  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: created, error: insertErr } = await sb
    .from("app_users")
    .insert({ username, password })
    .select("id, username")
    .maybeSingle();
  if (insertErr) {
    const isDuplicate = insertErr.code === "23505";
    return NextResponse.json(
      { error: isDuplicate ? "username already exists" : insertErr.message },
      { status: isDuplicate ? 409 : 500 },
    );
  }
  if (!created) return NextResponse.json({ error: "insert failed" }, { status: 500 });

  const perms = body.permissions ?? {};
  const rows = AGENCY_SLUGS.flatMap<{ user_id: string; agency: AgencySlug; role: AgencyRole }>(
    (a) => {
      const role = perms[a];
      return role === "view" || role === "editor"
        ? [{ user_id: created.id, agency: a, role }]
        : [];
    },
  );
  if (rows.length > 0) {
    const { error: permErr } = await sb.from("user_agency_permissions").insert(rows);
    if (permErr) {
      // 사용자는 만들어졌으니 롤백은 하지 않고 에러만 보고
      return NextResponse.json({ error: `user created but permissions failed: ${permErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      user: {
        id: created.id,
        username: created.username,
        isAdmin: isAdminUsername(created.username),
        permissions: { ...emptyPerms(), ...perms },
      },
    },
    { status: 201 },
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/api/admin/users/route.ts
git commit -m "feat(permissions): admin GET/POST users API"
```

---

## Task 10: Admin API — PATCH, DELETE `/api/admin/users/[id]`

**Files:**
- Create: `app/api/admin/users/[id]/route.ts`

- [ ] **Step 1: 핸들러 작성**

```ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/api-guards";
import { isAdminUsername, type AgencyRole } from "@/lib/permissions";
import { isAgencySlug, type AgencySlug } from "@/lib/agencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Permissions = Partial<Record<AgencySlug, AgencyRole | null>>;
type PatchBody = { password?: string; permissions?: Permissions };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: target, error: fetchErr } = await sb
    .from("app_users")
    .select("id, username")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  // admin 사용자(env로 결정)의 권한 row 편집은 의미 없으므로 거부
  if (isAdminUsername(target.username) && body.permissions !== undefined) {
    return NextResponse.json(
      { error: "admin user permissions are env-controlled" },
      { status: 400 },
    );
  }

  if (body.password !== undefined) {
    if (!body.password) return NextResponse.json({ error: "password empty" }, { status: 400 });
    const { error } = await sb.from("app_users").update({ password: body.password }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.permissions !== undefined) {
    for (const [agencyKey, role] of Object.entries(body.permissions)) {
      if (!isAgencySlug(agencyKey)) continue;
      const agency = agencyKey as AgencySlug;
      if (role === null) {
        const { error } = await sb
          .from("user_agency_permissions")
          .delete()
          .eq("user_id", id)
          .eq("agency", agency);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else if (role === "view" || role === "editor") {
        const { error } = await sb
          .from("user_agency_permissions")
          .upsert(
            { user_id: id, agency, role },
            { onConflict: "user_id,agency" },
          );
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        return NextResponse.json({ error: `invalid role: ${role}` }, { status: 400 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { id } = await params;
  if (id === g.user.id) {
    return NextResponse.json({ error: "cannot delete yourself" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: target } = await sb.from("app_users").select("username").eq("id", id).maybeSingle();
  if (target && isAdminUsername(target.username)) {
    return NextResponse.json({ error: "cannot delete admin user" }, { status: 400 });
  }

  const { error } = await sb.from("app_users").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/api/admin/users/\[id\]/route.ts
git commit -m "feat(permissions): admin PATCH/DELETE user API"
```

---

## Task 11: `/admin/users` 페이지 (서버 컴포넌트)

**Files:**
- Create: `app/admin/users/page.tsx`

- [ ] **Step 1: 페이지 작성**

```tsx
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { loadPermissions, isAdminUsername, type AgencyRole } from "@/lib/permissions";
import type { AgencySlug } from "@/lib/agencies";
import { supabaseAdmin } from "@/lib/supabase";
import TopBar from "@/app/_components/TopBar";
import UsersTable from "./_components/UsersTable";

export const dynamic = "force-dynamic";

export type AdminUserRow = {
  id: string;
  username: string;
  isAdmin: boolean;
  permissions: Record<AgencySlug, AgencyRole | null>;
};

function emptyPerms(): Record<AgencySlug, AgencyRole | null> {
  return { mih_speaker: null, mih_casting: null, mih_agency: null };
}

export default async function AdminUsersPage() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  if (!perms.isAdmin) redirect("/");

  const sb = supabaseAdmin();
  const [usersRes, permsRes] = await Promise.all([
    sb.from("app_users").select("id, username, created_at").order("created_at"),
    sb.from("user_agency_permissions").select("user_id, agency, role"),
  ]);

  if (usersRes.error) {
    return <main className="p-6 text-red-700">사용자 조회 실패: {usersRes.error.message}</main>;
  }
  if (permsRes.error) {
    return <main className="p-6 text-red-700">권한 조회 실패: {permsRes.error.message}</main>;
  }

  const byUser = new Map<string, Record<AgencySlug, AgencyRole | null>>();
  for (const u of usersRes.data ?? []) byUser.set(u.id, emptyPerms());
  for (const r of permsRes.data ?? []) {
    const map = byUser.get(r.user_id as string);
    if (map) map[r.agency as AgencySlug] = r.role as AgencyRole;
  }

  const rows: AdminUserRow[] = (usersRes.data ?? []).map((u) => ({
    id: u.id,
    username: u.username,
    isAdmin: isAdminUsername(u.username),
    permissions: byUser.get(u.id) ?? emptyPerms(),
  }));

  return (
    <div className="min-h-screen bg-[color:var(--color-muted)]">
      <TopBar generatedAt={new Date().toISOString()} isAdmin={true} />
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-lg font-bold mb-4">사용자 관리</h1>
        <UsersTable initialUsers={rows} currentUserId={user.id} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `UsersTable`이 없어서 에러 — Task 12에서 해소.

---

## Task 12: `UsersTable` 클라이언트 컴포넌트

**Files:**
- Create: `app/admin/users/_components/UsersTable.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { AgencyRole } from "@/lib/permissions";
import { AGENCY_SLUGS, AGENCIES, type AgencySlug } from "@/lib/agencies";
import type { AdminUserRow } from "../page";
import NewUserModal from "./NewUserModal";
import PasswordModal from "./PasswordModal";

type Props = {
  initialUsers: AdminUserRow[];
  currentUserId: string;
};

type Choice = "none" | AgencyRole;

const CHOICES: { value: Choice; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "view", label: "view" },
  { value: "editor", label: "editor" },
];

function choiceFromRole(role: AgencyRole | null): Choice {
  return role ?? "none";
}

export default function UsersTable({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers);
  const [showNew, setShowNew] = useState(false);
  const [pwTarget, setPwTarget] = useState<AdminUserRow | null>(null);

  async function setRole(user: AdminUserRow, agency: AgencySlug, next: Choice) {
    const prev = user.permissions[agency];
    const optimistic: AdminUserRow = {
      ...user,
      permissions: { ...user.permissions, [agency]: next === "none" ? null : next },
    };
    setUsers((cur) => cur.map((u) => (u.id === user.id ? optimistic : u)));

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { [agency]: next === "none" ? null : next } }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "request failed" }));
      toast.error(`권한 저장 실패: ${error}`);
      setUsers((cur) =>
        cur.map((u) =>
          u.id === user.id
            ? { ...u, permissions: { ...u.permissions, [agency]: prev } }
            : u,
        ),
      );
    } else {
      toast.success("권한 저장됨");
    }
  }

  async function removeUser(user: AdminUserRow) {
    if (!confirm(`사용자 ${user.username}을(를) 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "request failed" }));
      toast.error(`삭제 실패: ${error}`);
      return;
    }
    setUsers((cur) => cur.filter((u) => u.id !== user.id));
    toast.success("삭제됨");
  }

  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-lg">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="text-sm text-gray-600">총 {users.length}명</div>
        <Button size="sm" onClick={() => setShowNew(true)}>＋ 새 사용자</Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2">username</th>
            {AGENCY_SLUGS.map((a) => (
              <th key={a} className="text-left px-3 py-2">{AGENCIES[a].blogSlug}</th>
            ))}
            <th className="text-left px-3 py-2 w-24">작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="px-3 py-2">
                {u.username}
                {u.id === currentUserId && <span className="ml-1 text-xs text-gray-500">(나)</span>}
              </td>
              {AGENCY_SLUGS.map((a) => (
                <td key={a} className="px-3 py-2">
                  {u.isAdmin ? (
                    <span
                      className="text-xs text-amber-700"
                      title="ADMIN_USERNAMES env에서 관리"
                    >
                      admin ★
                    </span>
                  ) : (
                    <select
                      value={choiceFromRole(u.permissions[a])}
                      onChange={(e) => setRole(u, a, e.target.value as Choice)}
                      className="text-xs border rounded px-1 py-0.5"
                    >
                      {CHOICES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  )}
                </td>
              ))}
              <td className="px-3 py-2">
                {u.isAdmin ? (
                  <span className="text-xs text-gray-400">—</span>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPwTarget(u)}
                      className="text-xs px-1.5 py-0.5 border rounded hover:bg-gray-50"
                      title="비밀번호 변경"
                    >
                      🔑
                    </button>
                    <button
                      onClick={() => removeUser(u)}
                      className="text-xs px-1.5 py-0.5 border rounded hover:bg-red-50 text-red-600"
                      title="삭제"
                    >
                      🗑
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showNew && (
        <NewUserModal
          onClose={() => setShowNew(false)}
          onCreated={(u) => {
            setUsers((cur) => [...cur, u]);
            setShowNew(false);
          }}
        />
      )}
      {pwTarget && (
        <PasswordModal
          user={pwTarget}
          onClose={() => setPwTarget(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `NewUserModal`/`PasswordModal` 없어서 에러 — 다음 task에서 해소.

---

## Task 13: `NewUserModal`, `PasswordModal`

**Files:**
- Create: `app/admin/users/_components/NewUserModal.tsx`
- Create: `app/admin/users/_components/PasswordModal.tsx`

- [ ] **Step 1: `NewUserModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AGENCY_SLUGS, AGENCIES, type AgencySlug } from "@/lib/agencies";
import type { AgencyRole } from "@/lib/permissions";
import type { AdminUserRow } from "../page";

type Choice = "none" | AgencyRole;

const CHOICES: { value: Choice; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "view", label: "view" },
  { value: "editor", label: "editor" },
];

type Props = {
  onClose: () => void;
  onCreated: (u: AdminUserRow) => void;
};

export default function NewUserModal({ onClose, onCreated }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [perms, setPerms] = useState<Record<AgencySlug, Choice>>({
    mih_speaker: "none",
    mih_casting: "none",
    mih_agency: "none",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("username과 password를 입력하세요");
      return;
    }
    setBusy(true);
    const permissions = Object.fromEntries(
      AGENCY_SLUGS.map((a) => [a, perms[a] === "none" ? null : perms[a]]),
    );
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, permissions }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "request failed" }));
      toast.error(`생성 실패: ${error}`);
      return;
    }
    const { user } = (await res.json()) as { user: AdminUserRow };
    toast.success("사용자 생성됨");
    onCreated(user);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-lg p-5 w-full max-w-md space-y-3">
        <h2 className="text-base font-bold">새 사용자</h2>
        <div>
          <label className="block text-xs text-gray-600 mb-1">username</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">password</label>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-gray-600 mb-1">권한</div>
          <div className="space-y-1">
            {AGENCY_SLUGS.map((a) => (
              <div key={a} className="flex items-center gap-2 text-sm">
                <div className="w-24">{AGENCIES[a].blogSlug}</div>
                <select
                  value={perms[a]}
                  onChange={(e) =>
                    setPerms((p) => ({ ...p, [a]: e.target.value as Choice }))
                  }
                  className="text-xs border rounded px-1 py-0.5"
                >
                  {CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "생성 중..." : "생성"}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: `PasswordModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { AdminUserRow } from "../page";

type Props = {
  user: AdminUserRow;
  onClose: () => void;
};

export default function PasswordModal({ user, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      toast.error("password를 입력하세요");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "request failed" }));
      toast.error(`변경 실패: ${error}`);
      return;
    }
    toast.success("비밀번호 변경됨");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-lg p-5 w-full max-w-sm space-y-3">
        <h2 className="text-base font-bold">{user.username} 비밀번호 변경</h2>
        <Input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="새 비밀번호"
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "변경 중..." : "변경"}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 4: 커밋 (Task 11~13 함께)**

```bash
git add app/admin/users/page.tsx app/admin/users/_components/UsersTable.tsx app/admin/users/_components/NewUserModal.tsx app/admin/users/_components/PasswordModal.tsx
git commit -m "feat(permissions): /admin/users 페이지 + 인라인 권한 편집"
```

---

## Task 14: 수동 검증 시나리오

**Files:** 없음 (런타임 검증)

- [ ] **Step 1: 개발 서버 실행**

Run: `npm run dev`
별도 터미널 또는 background로 실행. http://localhost:3000 접속.

- [ ] **Step 2: 시나리오 A — admin 본인 동작**

1. `bpark0718`으로 로그인.
2. 모아보기에 3개 컬럼 모두 보이는지 확인.
3. TopBar에 "사용자 관리" 링크 표시 확인.
4. `/admin/users` 진입 → 본인 행이 "admin ★" 정적 표기인지 확인.

- [ ] **Step 3: 시나리오 B — 새 사용자 생성**

1. `/admin/users`에서 [＋ 새 사용자] → username=`test_view`, password=`x`, mih_speaker=view, 나머지 없음으로 생성.
2. 한 번 더 [＋ 새 사용자] → username=`test_editor`, password=`x`, mih_casting=editor, 나머지 없음으로 생성.

- [ ] **Step 4: 시나리오 C — view 사용자 동작**

1. 로그아웃 → `test_view` / `x`로 로그인.
2. 모아보기에 mih_speaker 컬럼만 보이는지 확인.
3. TopBar에 "사용자 관리" 링크가 없는지 확인.
4. 카드 클릭 → 모달 열림. 메타 편집 입력이 disabled이고 저장 버튼이 없는지 확인.
5. 본문 미리보기 / 제목 복사 / 본문 복사가 정상 동작하는지 확인.
6. `/admin/users` 직접 URL 입력 → `/`로 리다이렉트.

- [ ] **Step 5: 시나리오 D — editor 사용자 동작**

1. 로그아웃 → `test_editor` / `x`로 로그인.
2. 모아보기에 mih_casting 컬럼만 보이는지 확인.
3. 모달 메타 편집 가능하고 저장 시 200으로 반영되는지 확인.
4. (옵션) 다른 agency 카드 ID를 알고 있다면 직접 `PATCH /api/articles/<id>`로 시도 → 403 응답 확인.

- [ ] **Step 6: 정리**

1. `bpark0718`으로 다시 로그인.
2. `/admin/users`에서 `test_view`, `test_editor`를 🗑 버튼으로 삭제.
3. 개발 서버 종료.

- [ ] **Step 7: 검증 완료 표시 커밋 없음**

검증 task는 코드 변경 없으므로 커밋하지 않음.

---

## Task 15: 마무리

- [ ] **Step 1: 전체 빌드 + 테스트**

Run: `npm run build && npm test`
Expected: 빌드 성공 + 모든 테스트 PASS.

- [ ] **Step 2: 변경 요약 자체 확인**

`git log --oneline` 으로 커밋 7~8개가 깔끔하게 쌓여 있는지 확인:
- feat(permissions): user_agency_permissions 테이블 추가
- feat(permissions): 권한 평가 헬퍼 + 유닛 테스트
- feat(permissions): API 가드 헬퍼 추가
- feat(permissions): 권한 기반 칸반 컬럼/모달 가시성 적용
- feat(permissions): articles PATCH에 editor 가드 추가
- feat(permissions): admin GET/POST users API
- feat(permissions): admin PATCH/DELETE user API
- feat(permissions): /admin/users 페이지 + 인라인 권한 편집

- [ ] **Step 3: 사용자에게 보고**

PR / push 여부는 사용자 명시 요청 시에만.
