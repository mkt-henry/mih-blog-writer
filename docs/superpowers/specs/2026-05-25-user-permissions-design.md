# 사용자별 Agency 권한 시스템 설계

작성일: 2026-05-25
대상 코드베이스: `mih-blog-writer` (Next.js 15 App Router + Supabase)

## 1. 배경 / 목표

현재 `app_users`에 등록된 모든 로그인 사용자는 동일한 권한을 가진다 — 3개 agency(`mih_speaker`, `mih_casting`, `mih_agency`)의 모든 원고를 모아보기에서 보고, 모달에서 메타/키워드를 편집할 수 있다.

운영 중 외부 협력자(예: 특정 대행사 담당자)에게 일부 agency의 원고만 보여주거나, 키워드 등록 권한 없이 조회만 허용해야 하는 요구가 발생했다. 본 설계는 **agency × role 매트릭스** 형태로 사용자 권한을 부여·관리하는 시스템을 도입한다.

## 2. 권한 모델

### 2.1 핵심 개념

- **권한 매트릭스**: 사용자별로 (agency, role) 행을 가진다. row가 존재하면 해당 agency에 대해 `view` 또는 `editor` 권한을 가지며, row가 없으면 해당 agency를 전혀 볼 수 없다 (UI에서 컬럼·항목 자체 미노출).
- **Role 레벨 2단계**:
  - `view` — 칸반에서 해당 agency 컬럼이 보이고, 모달로 원고를 열어 미리보기 및 제목·본문 복사가 가능. 메타/키워드 편집과 발행 증거 등록은 불가.
  - `editor` — `view`의 모든 권한 + 모달 메타 편집(instagram_url, notes, category 등), 키워드 등록, 발행 상태 변경.
- **시스템 admin** — `app_users` 테이블에 boolean 컬럼을 두지 않고 `ADMIN_USERNAMES` 환경 변수(쉼표 구분)로 결정. admin은 자동으로 모든 agency editor 권한을 가지며 `/admin/users` 페이지에 접근할 수 있다. 기본값은 `bpark0718`.

### 2.2 결정 근거

- `app_users.is_admin` 컬럼을 두지 않은 이유: 사용자 수가 매우 적고(현재 1명), admin 추가 빈도가 낮아 env 편집으로 충분. DB row가 admin 여부의 source of truth가 되면 또 다른 "admin이 admin을 임명" 권한 흐름이 필요해진다.
- agency × role 매트릭스(맵)를 단순한 글로벌 role로 평탄화하지 않은 이유: 실제 요구가 "이 사람은 캐스팅만 보고 스피커는 보지 않는다" 같은 agency 단위 격리이기 때문.
- view 단계에서 본문 복사를 허용하는 이유: view의 본질이 "원고를 활용하되 데이터는 건드리지 않는다"이기 때문. 외부 협력자가 자기 대행사의 원고를 가져가 사용하는 시나리오를 차단할 이유가 없다.

## 3. 데이터 모델

### 3.1 새 테이블: `user_agency_permissions`

```sql
-- supabase/migrations/20260525000000_user_agency_permissions.sql
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

- RLS는 기존 테이블들과 동일하게 service_role 전용.
- composite PK `(user_id, agency)`로 한 사용자가 한 agency에 단일 role만 갖도록 강제.
- 마이그레이션 자체가 기존 사용자에 대한 권한을 자동 보장하므로, 기존 단일 사용자 환경에서는 동작 변화가 없다.

### 3.2 기존 테이블

변경 없음. `app_users`, `app_sessions`는 그대로.

## 4. 권한 평가 헬퍼: `lib/permissions.ts`

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

const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES ?? "bpark0718")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isAdminUsername(username: string): boolean {
  return ADMIN_USERNAMES.includes(username);
}

export async function loadPermissions(
  userId: string,
  username: string,
): Promise<UserPermissions> {
  const isAdmin = isAdminUsername(username);
  if (isAdmin) {
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

  const agencies: UserPermissions["agencies"] = {
    mih_speaker: null,
    mih_casting: null,
    mih_agency: null,
  };
  for (const r of data ?? []) {
    agencies[r.agency as AgencySlug] = r.role as AgencyRole;
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

## 5. 권한 강제 (3계층)

### 5.1 서버 데이터 페치 (페이지 진입)

`app/page.tsx`에서 articles를 불러올 때 보이는 agency만 가져온다.

```ts
const user = await verifySession();
if (!user) redirect("/login");
const perms = await loadPermissions(user.id, user.username);
const visible = visibleAgencies(perms);

const articlesRes = await sb
  .from("articles")
  .select("...")
  .in("agency", visible.length > 0 ? visible : ["__none__"])
  .order("created_at", { ascending: false });
```

- `visible`이 비면 어떤 agency도 매칭되지 않을 sentinel 값을 넣어 빈 결과를 반환.
- DashboardClient에 `perms` prop을 추가로 전달.

### 5.2 API 라우트 (쓰기)

원고 메타 편집, 키워드 등록 등 모든 mutation API는 진입 시 권한 검사를 수행한다.

- `PATCH /api/articles/[id]` — 대상 article의 agency를 조회 → `canEdit(perms, agency)` 실패 시 403.
- 키워드 등록 API(`PATCH /api/articles/[id]`의 keyword 필드 또는 별도 endpoint) — 동일 패턴.
- Admin API(`/api/admin/users/*`) — `perms.isAdmin === false`면 403.

검사를 한 곳에서 묶는 헬퍼 `requireEditor(agency)` / `requireAdmin()`을 `lib/api-guards.ts`에 둔다.

### 5.3 클라이언트 UI

서버에서 잘라낸 결과를 받으므로 클라이언트는 정보 노출 차단보다 **UX 차원의 깔끔함**을 담당.

- `DashboardClient`는 `perms`에 따라 권한 없는 agency의 칸반 컬럼을 그리지 않는다.
- `ArticleModal`은 `canEdit(perms, article.agency) === false`일 때 메타 편집 입력을 read-only로 만들고 "저장" 버튼을 숨긴다.
- `TopBar`는 `perms.isAdmin === true`일 때만 "사용자 관리" 링크를 노출한다.

## 6. Admin UI: `/admin/users`

### 6.1 라우트

- `app/admin/users/page.tsx` — 서버 컴포넌트. 진입 시 `perms.isAdmin` 검증, 실패 시 `/`로 리다이렉트.
- `app/admin/users/_components/UsersTable.tsx` — 클라이언트 컴포넌트, 단일 테이블 + 인라인 편집.

### 6.2 화면 구성

```
사용자 관리                                  [＋ 새 사용자]

| username   | speaker   | casting   | agency    | 작업    |
| ---------- | --------- | --------- | --------- | ------- |
| bpark0718  | admin ★   | admin ★   | admin ★   |   —     |
| kim_pd     | [editor▾] | [view  ▾] | [없음  ▾] | 🔑 🗑    |
| lee_csm    | [없음  ▾] | [editor▾] | [editor▾] | 🔑 🗑    |
```

- 권한 셀: `없음 / view / editor` 드롭다운. 변경 즉시 PATCH 발사.
- 🔑: 비밀번호 변경 모달 (single field).
- 🗑: 사용자 삭제 (확인 모달).
- admin 행은 드롭다운 대신 "admin ★" 정적 표기 + 툴팁("Vercel 환경 변수 `ADMIN_USERNAMES`에서 관리").

### 6.3 [＋ 새 사용자] 모달

필드: username, password, 3 agency 각각 `없음 / view / editor` 드롭다운.
저장 시 POST → 성공하면 모달 닫고 테이블 리프레시.

## 7. Admin API 명세 (`/api/admin/users/*`)

모든 엔드포인트는 진입 시 `requireAdmin()` 통과.

| Method | Path | Body | 응답 |
|---|---|---|---|
| GET    | `/api/admin/users`        | —                                                                       | `{users: [{id, username, isAdmin, permissions: {agency: role \| null}}]}` |
| POST   | `/api/admin/users`        | `{username, password, permissions: {agency: role \| null}}`             | `{user}` (201) |
| PATCH  | `/api/admin/users/[id]`   | `{password?, permissions?: {agency: role \| null}}` (부분 업데이트)     | `{user}` |
| DELETE | `/api/admin/users/[id]`   | —                                                                       | `{ok: true}` |

- `permissions[agency] = null`은 해당 row 삭제(권한 박탈), `"view"`/`"editor"`는 upsert.
- 자신을 삭제하거나 자신의 admin 상태를 변경할 수 없음 — admin은 env가 source of truth이므로 자연히 보호되지만, POST/PATCH에서 `username === session.username && session.username in ADMIN_USERNAMES`인 경우 password 외 편집을 거부하는 가드를 둔다.

## 8. 로그인 흐름 / 세션

기존 `lib/auth.ts`의 `verifySession()` 변경 없음. 각 서버 컴포넌트가 진입 시 `verifySession()` → `loadPermissions()` 순으로 호출한다. 호출 빈도가 낮고 데이터가 작아 캐싱은 도입하지 않는다.

## 9. 마이그레이션 / 롤아웃 안전성

1. 새 마이그레이션 적용 → `user_agency_permissions` 생성 + `bpark0718`에 모든 agency editor 부여.
2. `ADMIN_USERNAMES` env가 없으면 기본값 `bpark0718`이 admin이 됨.
3. 기존 사용자(현재 1명)는 모든 컬럼 그대로, 모든 편집 그대로. UI 변화는 TopBar에 "사용자 관리" 링크가 추가되는 것뿐.
4. 추가 사용자가 생기기 전까지 동작 회귀 위험 없음.

## 10. 의도적 제외 (YAGNI)

- 권한 변경 audit log — 사용자/변경 빈도 모두 매우 낮음.
- 사용자 그룹·팀 개념 — 직접 부여로 충분.
- 액션별 미세 권한(예: "키워드 등록만 가능, 메타 편집은 불가") — editor 한 묶음으로 충분.
- 비밀번호 해싱 — 기존 정책 유지 (`AGENTS.md` 명시: 내부 도구).
- agency 단위 admin role — 시스템 전역 admin과 agency editor로 충분.

## 11. 변경 파일 목록 (요약)

추가:
- `supabase/migrations/20260525000000_user_agency_permissions.sql`
- `lib/permissions.ts`
- `lib/api-guards.ts`
- `app/admin/users/page.tsx`
- `app/admin/users/_components/UsersTable.tsx`
- `app/admin/users/_components/NewUserModal.tsx`
- `app/api/admin/users/route.ts` (GET, POST)
- `app/api/admin/users/[id]/route.ts` (PATCH, DELETE)

수정:
- `app/page.tsx` — `loadPermissions` 통과, `visible`로 articles 필터.
- `app/_components/DashboardClient.tsx` — `perms` prop 추가, 권한 없는 컬럼 미렌더.
- `app/_components/TopBar.tsx` — admin에게 "사용자 관리" 링크.
- `app/_components/ArticleModal.tsx` / `ArticleModalMeta.tsx` — `canEdit` 기준 read-only 모드.
- `app/api/articles/[id]/route.ts` — `requireEditor(agency)` 가드.
