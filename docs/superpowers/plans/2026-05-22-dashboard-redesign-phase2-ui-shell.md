# 대시보드 개편 Phase 2 — UI Shell (셋업 + 메인 칸반 + 풀페이지)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 `/` 화면을 그대로 둔 채 `/dashboard-v2` 라우트에 신규 메인 칸반 대시보드와 `/articles/[id]` 풀페이지를 구축한다. Tailwind+shadcn 도입과 데이터 레이어 정리까지 포함. 모달·`/rss` 신규 화면·키워드 메타 편집은 후속 Plan에서.

**Architecture:** Next.js 15 App Router 위에 Tailwind v4 + shadcn/ui를 도입. 메인 페이지는 Server Component(`page.tsx`)에서 articles 데이터를 fetch해 `DashboardClient`에 넘기는 island 구조. 칸반 컴포넌트는 발행 대기 풀/오늘 발행/최근 발행 3섹션으로 그룹핑하고 컬럼 헤더에 정렬 토글이 들어간다. 카드 클릭은 우선 `/articles/[id]` 풀페이지로 이동 (모달은 Plan 3에서 그 위에 추가).

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript, Tailwind CSS v4, shadcn/ui (Radix UI), Supabase JS 클라이언트(server-side service_role)

**관련 스펙:** `docs/superpowers/specs/2026-05-22-dashboard-redesign-design.md` 섹션 5·6·7·9

---

## 사전 준비 / 가정

- Plan 1 (`feat/dashboard-redesign-phase1`)이 merge됐거나 base 브랜치로 분기 가능한 상태
- 작업 브랜치: `feat/dashboard-redesign-phase2-ui` (Plan 1 위에서 분기)
- `articles` 테이블에 Phase 1에서 추가한 6개 컬럼 (instagram_url, category, notes, published_at, published_url, published_source)이 이미 존재
- `npm run dev` 가능, http://localhost:3000 또는 3002 접속 가능
- 기존 `/` (HomeView.tsx), `/keywords`, `/rss` 모두 정상 동작 — Phase 2에서는 건드리지 않는다

---

## 파일 구조

```
app/
├── layout.tsx                                          (MODIFY — Toaster Provider 추가)
├── globals.css                                         (REWRITE — Tailwind base + shadcn 변수)
├── page.tsx                                            (NO CHANGE — 기존 HomeView 그대로)
├── dashboard-v2/
│   ├── page.tsx                                        (NEW — Server, articles fetch)
│   └── _components/
│       ├── DashboardClient.tsx                         (NEW — "use client" 루트)
│       ├── TopBar.tsx                                  (NEW)
│       ├── KpiStrip.tsx                                (NEW)
│       ├── FilterBar.tsx                               (NEW)
│       ├── KanbanBoard.tsx                             (NEW)
│       ├── KanbanColumn.tsx                            (NEW)
│       └── ArticleCard.tsx                             (NEW)
├── articles/[id]/page.tsx                              (NEW — Server, 풀페이지)
└── (기존 라우트 모두 그대로)
components/
└── ui/                                                 (NEW — shadcn generated)
    ├── button.tsx
    ├── card.tsx
    ├── badge.tsx
    ├── tabs.tsx
    ├── input.tsx
    ├── sonner.tsx                                      (Toast)
    └── ...
lib/
├── articles.ts                                         (NEW — 쿼리 헬퍼)
├── business-card.ts                                    (NEW — HomeView에서 추출)
└── (기존 파일 그대로)
postcss.config.mjs                                      (NEW — Tailwind v4)
components.json                                         (NEW — shadcn config)
package.json                                            (MODIFY — Tailwind/shadcn deps)
tailwind.config.ts                                      (Tailwind v4는 옵션 — 일단 생략)
```

`app/_components/`가 아닌 `app/dashboard-v2/_components/`인 이유: Phase 3 스위치 오버 시 `/dashboard-v2` 전체를 `/`로 이동시키기 쉽도록 페이지 콜로케이션.

---

## Task 1: 작업 브랜치 분기

**Files:** 없음 (git만)

- [ ] **Step 1.1: 현재 브랜치 확인**

```bash
git status
```
Expected: clean. `feat/dashboard-redesign-phase1` (또는 main에 merge됐으면 그 상태)에서 출발.

- [ ] **Step 1.2: 새 브랜치 분기**

Plan 1이 아직 merge되지 않았으면:
```bash
git switch -c feat/dashboard-redesign-phase2-ui feat/dashboard-redesign-phase1
```
Plan 1이 merge됐으면:
```bash
git switch -c feat/dashboard-redesign-phase2-ui main
git pull origin main
```

Expected: 새 브랜치로 전환.

---

## Task 2: Tailwind v4 설치 + 초기 설정

**Files:**
- Modify: `package.json`
- Create: `postcss.config.mjs`
- Rewrite: `app/globals.css`

- [ ] **Step 2.1: 패키지 설치**

```bash
npm install -D tailwindcss@^4 @tailwindcss/postcss postcss
```

- [ ] **Step 2.2: `postcss.config.mjs` 생성**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 2.3: `app/globals.css`가 존재하는지 확인 후 기존 내용 점검**

```bash
cat app/globals.css 2>/dev/null || echo "(파일 없음)"
```

기존 내용이 있으면 백업해두기 (보존할 스타일이 있을 수 있음). 보존할 게 없으면 통째로 교체.

- [ ] **Step 2.4: `app/globals.css` 신규 작성**

```css
@import "tailwindcss";

@theme {
  --color-primary: #1565C0;
  --color-speaker: #1565C0;
  --color-casting: #7B1FA2;
  --color-agency: #2E7D32;
  --color-warning: #F9A825;
  --color-danger: #C62828;
  --color-muted: #F5F6F8;
  --color-border: #E3E5EA;
  --color-text: #222222;
  --color-text-muted: #888888;
  --radius: 0.5rem;
  --font-feature-settings: "tnum";
}

@layer base {
  html { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", Arial, sans-serif; color: var(--color-text); }
  body { background: var(--color-muted); margin: 0; }
}
```

- [ ] **Step 2.5: dev 서버에서 Tailwind 작동 확인**

```bash
npm run dev
```
별도 셸에서 http://localhost:3000 (또는 3002) 접속. 기존 `/` 페이지가 깨지지 않고 로드되는지 확인. 기존 인라인 style이 우선 적용되어 그대로 보여야 함.

확인 후 dev 서버는 켜둔 채로 진행.

- [ ] **Step 2.6: 커밋**

```bash
git add package.json package-lock.json postcss.config.mjs app/globals.css
git commit -m "chore: Tailwind v4 도입 (디자인 토큰 정의)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: shadcn/ui CLI 초기화

**Files:**
- Create: `components.json`
- Create: `components/ui/*.tsx` (CLI가 생성)

- [ ] **Step 3.1: shadcn init**

```bash
npx shadcn@latest init
```

대화형 프롬프트가 뜨면 다음으로 응답:
- Style: `Default`
- Base color: `Slate`
- CSS variables: `Yes`

생성되는 파일: `components.json`. 일부 globals.css 수정이 따라올 수 있음 (shadcn 변수 추가). 이 경우 Task 2.4의 `@theme`은 보존하고 shadcn 변수는 그 아래 `@layer base` 안에 병합.

- [ ] **Step 3.2: 필수 컴포넌트 추가**

Plan 2에서 사용할 것만 우선 설치:
```bash
npx shadcn@latest add button card badge input tabs sonner
```

생성: `components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `tabs.tsx`, `sonner.tsx`.

- [ ] **Step 3.3: 컴포넌트 import 동작 확인**

`app/dashboard-v2/test-render.tsx` 같은 임시 파일은 만들지 말 것. 대신 빌드만 확인:

```bash
npm run build 2>&1 | tail -30
```
Expected: 빌드 성공. shadcn 추가로 인한 에러 없음. 경고는 무시 가능.

- [ ] **Step 3.4: 커밋**

```bash
git add components.json components/ui/ app/globals.css package.json package-lock.json
git commit -m "chore: shadcn/ui 셋업 (button/card/badge/input/tabs/sonner)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `lib/business-card.ts` — HomeView에서 명함 합성 로직 추출

신규 UI와 풀페이지가 모두 명함 합성 로직을 쓰므로 별도 파일로 추출. 기존 `components/HomeView.tsx`의 `buildBusinessCardHtml`, `mergeWithBusinessCard`, `escapeHtml` 함수를 옮긴다.

**Files:**
- Create: `lib/business-card.ts`
- Modify: `components/HomeView.tsx`

- [ ] **Step 4.1: `lib/business-card.ts` 작성**

```ts
import { AGENCIES, BUSINESS_CARD_LINK_URL, type AgencySlug } from "@/lib/agencies";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

export function buildBusinessCardHtml(agency: AgencySlug): string {
  const a = AGENCIES[agency];
  const img = `<img src="${a.businessCardImageUrl}" width="${a.businessCardWidth}">`;
  const linkUrl = BUSINESS_CARD_LINK_URL;
  const inner = linkUrl ? `<a href="${linkUrl}">${img}</a>` : img;
  return `<p align="center">${inner}</p>`;
}

export function mergeWithBusinessCard(originalHtml: string, cardHtml: string): string {
  if (!cardHtml) return originalHtml;
  if (!originalHtml) return cardHtml;
  const m = originalHtml.match(/<a\s[^>]*href=["']https:\/\/open\.kakao\.com\//i);
  if (m && typeof m.index === "number") {
    const pStart = originalHtml.lastIndexOf("<p ", m.index);
    if (pStart !== -1) {
      return originalHtml.slice(0, pStart) + cardHtml + "\n" + originalHtml.slice(pStart);
    }
  }
  return `${originalHtml}\n${cardHtml}`;
}
```

- [ ] **Step 4.2: HomeView.tsx에서 동일 함수 정의 제거 + import 추가**

기존 `components/HomeView.tsx`의 `buildBusinessCardHtml`, `mergeWithBusinessCard`, `escapeHtml` 함수 정의를 삭제하고 import로 대체:

```ts
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";
```

(`escapeHtml`이 HomeView 내부에서 호출되지 않으면 import 안 해도 됨. 코드 확인 후 결정.)

- [ ] **Step 4.3: 기존 `/` 페이지 회귀 확인**

dev 서버 새로고침. 기존 모아보기에서 카드 클릭 → 미리보기 iframe에 명함이 카카오 링크 직전에 합성되는지 확인. 합성 위치가 바뀌면 안 됨.

- [ ] **Step 4.4: 커밋**

```bash
git add lib/business-card.ts components/HomeView.tsx
git commit -m "refactor: 명함 합성 로직을 lib/business-card.ts로 추출 (재사용 대비)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `lib/articles.ts` — 쿼리 헬퍼

칸반 화면에서 쓸 데이터 가공. 발행 대기 풀(`published_at is null`) FIFO 정렬, 오늘 발행(`published_at >= 오늘 00:00 KST`), 최근 발행(그 이전) 분류.

**Files:**
- Create: `lib/articles.ts`
- Test: `tests/articles.test.ts`

- [ ] **Step 5.1: 타입과 함수 시그니처를 위한 실패 테스트**

`tests/articles.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { groupArticlesForKanban, type ArticleRow } from '@/lib/articles';

function mk(over: Partial<ArticleRow>): ArticleRow {
  return {
    id: 'a',
    publish_date: '2026-05-21',
    agency: 'mih_speaker',
    slug: 'hong',
    person_name: '홍길동',
    title: '[홍길동 섭외] ...',
    source_path: null,
    instagram_url: null,
    category: null,
    notes: null,
    created_at: '2026-05-21T00:00:00Z',
    updated_at: '2026-05-21T00:00:00Z',
    published_at: null,
    published_url: null,
    published_source: null,
    ...over,
  };
}

const KST = 9 * 3600_000;
const todayKstIso = () => {
  const now = Date.now();
  const kstMidnight = Math.floor((now + KST) / 86400_000) * 86400_000 - KST;
  return new Date(kstMidnight).toISOString();
};

describe('groupArticlesForKanban', () => {
  it('separates pool (unpublished) from published, by agency', () => {
    const articles = [
      mk({ id: 'p1', agency: 'mih_speaker', published_at: null }),
      mk({ id: 'p2', agency: 'mih_speaker', published_at: new Date(Date.now() - 86400_000).toISOString() }), // 어제
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_speaker.pool.map((a) => a.id)).toEqual(['p1']);
    expect(grouped.mih_speaker.recent.map((a) => a.id)).toEqual(['p2']);
    expect(grouped.mih_speaker.today.length).toBe(0);
  });

  it('classifies today vs recent based on KST midnight', () => {
    const todayMid = todayKstIso();
    const articles = [
      mk({ id: 't', agency: 'mih_speaker', published_at: todayMid }),
      mk({ id: 'r', agency: 'mih_speaker', published_at: new Date(Date.parse(todayMid) - 1000).toISOString() }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_speaker.today.map((a) => a.id)).toEqual(['t']);
    expect(grouped.mih_speaker.recent.map((a) => a.id)).toEqual(['r']);
  });

  it('pool is sorted FIFO (oldest created_at first)', () => {
    const articles = [
      mk({ id: 'new', agency: 'mih_casting', created_at: '2026-05-21T00:00:00Z' }),
      mk({ id: 'old', agency: 'mih_casting', created_at: '2026-05-10T00:00:00Z' }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_casting.pool.map((a) => a.id)).toEqual(['old', 'new']);
  });

  it('today is sorted by published_at ASC', () => {
    const todayMid = todayKstIso();
    const articles = [
      mk({ id: 'late', agency: 'mih_agency', published_at: new Date(Date.parse(todayMid) + 11 * 3600_000).toISOString() }),
      mk({ id: 'early', agency: 'mih_agency', published_at: new Date(Date.parse(todayMid) + 9 * 3600_000).toISOString() }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_agency.today.map((a) => a.id)).toEqual(['early', 'late']);
  });

  it('recent is sorted by published_at DESC (most recent first)', () => {
    const articles = [
      mk({ id: 'old', agency: 'mih_agency', published_at: '2026-04-01T00:00:00Z' }),
      mk({ id: 'newer', agency: 'mih_agency', published_at: '2026-05-15T00:00:00Z' }),
    ];
    const grouped = groupArticlesForKanban(articles);
    expect(grouped.mih_agency.recent.map((a) => a.id)).toEqual(['newer', 'old']);
  });
});

describe('groupArticlesForKanban — KPIs', () => {
  it('computes pool size, today count, this-week count, unmatched flag', () => {
    // 이 케이스는 Step 5.3 후 추가
  });
});
```

마지막 describe는 우선 빈 상태로 두고 Step 5.3 후 채운다 (KPI 함수를 같이 노출).

- [ ] **Step 5.2: 실패 확인**

```bash
npm test -- tests/articles.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 5.3: `lib/articles.ts` 구현**

```ts
import type { AgencySlug } from '@/lib/agencies';

export type ArticleRow = {
  id: string;
  publish_date: string;
  agency: AgencySlug;
  slug: string;
  person_name: string;
  title: string;
  source_path: string | null;
  instagram_url: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  published_url: string | null;
  published_source: 'rss' | 'manual' | null;
};

export type AgencyGroup = {
  pool: ArticleRow[];
  today: ArticleRow[];
  recent: ArticleRow[];
};

export type KanbanGroups = Record<AgencySlug, AgencyGroup>;

const KST_OFFSET_MS = 9 * 3600_000;

function kstMidnightMs(now = Date.now()): number {
  return Math.floor((now + KST_OFFSET_MS) / 86400_000) * 86400_000 - KST_OFFSET_MS;
}

export function groupArticlesForKanban(articles: ArticleRow[], now = Date.now()): KanbanGroups {
  const todayStart = kstMidnightMs(now);

  const empty = (): AgencyGroup => ({ pool: [], today: [], recent: [] });
  const groups: KanbanGroups = {
    mih_speaker: empty(),
    mih_casting: empty(),
    mih_agency: empty(),
  };

  for (const a of articles) {
    const g = groups[a.agency];
    if (!g) continue;
    if (a.published_at === null) {
      g.pool.push(a);
    } else if (Date.parse(a.published_at) >= todayStart) {
      g.today.push(a);
    } else {
      g.recent.push(a);
    }
  }

  for (const slug of Object.keys(groups) as AgencySlug[]) {
    groups[slug].pool.sort((a, b) => a.created_at.localeCompare(b.created_at));
    groups[slug].today.sort((a, b) => (a.published_at ?? '').localeCompare(b.published_at ?? ''));
    groups[slug].recent.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  }

  return groups;
}

export type KanbanKpis = {
  poolTotal: number;
  todayTotal: number;
  weekTotal: number;
  unmatchedNeedReview: number;
};

export function computeKpis(articles: ArticleRow[], unmatchedCount: number, now = Date.now()): KanbanKpis {
  const todayStart = kstMidnightMs(now);
  const weekStart = todayStart - 6 * 86400_000;

  let pool = 0;
  let today = 0;
  let week = 0;
  for (const a of articles) {
    if (a.published_at === null) {
      pool++;
      continue;
    }
    const t = Date.parse(a.published_at);
    if (t >= todayStart) today++;
    if (t >= weekStart) week++;
  }
  return { poolTotal: pool, todayTotal: today, weekTotal: week, unmatchedNeedReview: unmatchedCount };
}
```

- [ ] **Step 5.4: 통과 확인 + KPI 테스트 추가**

`tests/articles.test.ts` 끝의 KPI describe 블록을 채운다:
```ts
describe('computeKpis', () => {
  it('counts pool size, today count, this-week count', () => {
    const todayMid = todayKstIso();
    const articles = [
      mk({ id: 'pool1', agency: 'mih_speaker', published_at: null }),
      mk({ id: 'pool2', agency: 'mih_casting', published_at: null }),
      mk({ id: 'today1', agency: 'mih_speaker', published_at: new Date(Date.parse(todayMid) + 1000).toISOString() }),
      mk({ id: 'week1', agency: 'mih_speaker', published_at: new Date(Date.parse(todayMid) - 2 * 86400_000).toISOString() }),
      mk({ id: 'old', agency: 'mih_speaker', published_at: new Date(Date.parse(todayMid) - 30 * 86400_000).toISOString() }),
    ];
    const { computeKpis } = require('@/lib/articles');
    const kpis = computeKpis(articles, 3);
    expect(kpis.poolTotal).toBe(2);
    expect(kpis.todayTotal).toBe(1);
    expect(kpis.weekTotal).toBe(2);
    expect(kpis.unmatchedNeedReview).toBe(3);
  });
});
```

(`require`를 쓰는 이유: 동적 import로 타입 import 제약 회피. ESM 환경이면 `import { computeKpis }`를 파일 상단으로 옮겨도 OK.)

```bash
npm test
```
Expected: 모든 신규 테스트 + 기존 rss-matcher 17개 모두 통과.

- [ ] **Step 5.5: 커밋**

```bash
git add lib/articles.ts tests/articles.test.ts
git commit -m "feat(articles): 칸반 그룹핑 + KPI 계산 헬퍼 (KST 기준)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `app/dashboard-v2/page.tsx` — Server-side 데이터 fetch

**Files:**
- Create: `app/dashboard-v2/page.tsx`

- [ ] **Step 6.1: 파일 작성**

```tsx
import { supabaseAdmin } from "@/lib/supabase";
import { groupArticlesForKanban, computeKpis, type ArticleRow } from "@/lib/articles";
import { isAgencySlug } from "@/lib/agencies";
import DashboardClient from "./_components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardV2Page() {
  const sb = supabaseAdmin();

  const [articlesRes, unmatchedRes] = await Promise.all([
    sb.from("articles")
      .select("id,publish_date,agency,slug,person_name,title,source_path,instagram_url,category,notes,created_at,updated_at,published_at,published_url,published_source")
      .order("created_at", { ascending: false }),
    sb.from("unmatched_rss_items")
      .select("agency", { count: "exact", head: true }),
  ]);

  if (articlesRes.error) {
    return (
      <main className="p-6 text-red-700">
        DB 조회 실패: {articlesRes.error.message}
      </main>
    );
  }

  const articles = ((articlesRes.data || []) as ArticleRow[]).filter((a) => isAgencySlug(a.agency));
  const groups = groupArticlesForKanban(articles);
  const kpis = computeKpis(articles, unmatchedRes.count ?? 0);

  return <DashboardClient groups={groups} kpis={kpis} generatedAt={new Date().toISOString()} />;
}
```

- [ ] **Step 6.2: 다음 Task로**

이 파일만 있고 `DashboardClient`가 없으면 빌드 실패. Task 7~13에서 컴포넌트를 만든 뒤 페이지가 동작. 이 시점에는 빌드하지 않고 진행.

(중간 커밋을 만들지 않는 이유: 깨진 상태의 커밋을 남기지 않는다. Task 13에서 완성 후 커밋.)

---

## Task 7: `DashboardClient.tsx` — 클라이언트 루트

**Files:**
- Create: `app/dashboard-v2/_components/DashboardClient.tsx`

- [ ] **Step 7.1: 파일 작성**

```tsx
"use client";

import { useMemo, useState } from "react";
import type { KanbanGroups, KanbanKpis, ArticleRow } from "@/lib/articles";
import TopBar from "./TopBar";
import KpiStrip from "./KpiStrip";
import FilterBar, { type FilterChip } from "./FilterBar";
import KanbanBoard from "./KanbanBoard";

type Props = {
  groups: KanbanGroups;
  kpis: KanbanKpis;
  generatedAt: string;
};

export default function DashboardClient({ groups, kpis, generatedAt }: Props) {
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<FilterChip>("all");

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (a: ArticleRow) => {
      if (chip === "unpublished" && a.published_at !== null) return false;
      if (chip === "today" && (a.published_at === null || !isToday(a.published_at))) return false;
      if (chip === "missing_instagram" && a.instagram_url) return false;
      if (!q) return true;
      return (
        a.person_name.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        (a.notes ?? "").toLowerCase().includes(q)
      );
    };
    const filter = (g: typeof groups.mih_speaker) => ({
      pool: g.pool.filter(match),
      today: g.today.filter(match),
      recent: g.recent.filter(match),
    });
    return {
      mih_speaker: filter(groups.mih_speaker),
      mih_casting: filter(groups.mih_casting),
      mih_agency: filter(groups.mih_agency),
    };
  }, [groups, search, chip]);

  return (
    <div className="min-h-screen bg-[color:var(--color-muted)] text-[color:var(--color-text)]">
      <TopBar generatedAt={generatedAt} />
      <KpiStrip kpis={kpis} />
      <FilterBar search={search} onSearch={setSearch} chip={chip} onChip={setChip} />
      <KanbanBoard groups={filteredGroups} />
    </div>
  );
}

const KST_OFFSET_MS = 9 * 3600_000;
function isToday(iso: string): boolean {
  const t = Date.parse(iso);
  const midnight = Math.floor((Date.now() + KST_OFFSET_MS) / 86400_000) * 86400_000 - KST_OFFSET_MS;
  return t >= midnight;
}
```

---

## Task 8: `TopBar.tsx`

**Files:**
- Create: `app/dashboard-v2/_components/TopBar.tsx`

- [ ] **Step 8.1: 파일 작성**

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = { generatedAt: string };

export default function TopBar({ generatedAt }: Props) {
  return (
    <header className="flex items-center gap-3 bg-white border-b border-[color:var(--color-border)] px-4 py-2.5">
      <div className="text-sm font-bold text-[color:var(--color-primary)]">MIH</div>
      <nav className="flex gap-1 ml-2">
        <Link href="/dashboard-v2" className="px-3 py-1 text-sm rounded bg-blue-50 text-[color:var(--color-primary)] font-semibold">모아보기</Link>
        <Link href="/keywords" className="px-3 py-1 text-sm rounded text-gray-600 hover:bg-gray-50">키워드</Link>
        <Link href="/rss" className="px-3 py-1 text-sm rounded text-gray-600 hover:bg-gray-50">발행 현황</Link>
      </nav>
      <div className="flex-1" />
      <div className="text-xs text-[color:var(--color-text-muted)]">
        데이터 {generatedAt.slice(0, 16).replace('T', ' ')}
      </div>
      <form action="/api/auth/logout" method="POST" onSubmit={async (e) => {
        e.preventDefault();
        await fetch("/api/auth/logout", { method: "POST" });
        location.href = "/login";
      }}>
        <Button type="submit" variant="outline" size="sm">로그아웃</Button>
      </form>
    </header>
  );
}
```

---

## Task 9: `KpiStrip.tsx`

**Files:**
- Create: `app/dashboard-v2/_components/KpiStrip.tsx`

- [ ] **Step 9.1: 파일 작성**

```tsx
import type { KanbanKpis } from "@/lib/articles";

type Props = { kpis: KanbanKpis };

const ITEMS: { key: keyof KanbanKpis; label: string; suffix?: string; tone: string }[] = [
  { key: "poolTotal", label: "대기 풀", suffix: "건", tone: "text-[color:var(--color-primary)]" },
  { key: "todayTotal", label: "오늘 발행", suffix: "/ 10 목표", tone: "text-[color:var(--color-agency)]" },
  { key: "weekTotal", label: "이번 주", suffix: "건", tone: "text-purple-700" },
  { key: "unmatchedNeedReview", label: "RSS 미매칭 ⚠", suffix: "확인 필요", tone: "text-[color:var(--color-warning)]" },
];

export default function KpiStrip({ kpis }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3 px-4 py-3 bg-white border-b border-[color:var(--color-border)]">
      {ITEMS.map(({ key, label, suffix, tone }) => (
        <div key={key} className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--color-text-muted)]">{label}</div>
          <div className={`text-xl font-bold ${tone}`}>
            {kpis[key]}
            {suffix && <span className="ml-1 text-xs font-medium text-[color:var(--color-text-muted)]">{suffix}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Task 10: `FilterBar.tsx`

**Files:**
- Create: `app/dashboard-v2/_components/FilterBar.tsx`

- [ ] **Step 10.1: 파일 작성**

```tsx
"use client";

import { Input } from "@/components/ui/input";

export type FilterChip = "all" | "unpublished" | "today" | "missing_instagram";

type Props = {
  search: string;
  onSearch: (s: string) => void;
  chip: FilterChip;
  onChip: (c: FilterChip) => void;
};

const CHIPS: { key: FilterChip; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "unpublished", label: "미발행" },
  { key: "today", label: "오늘" },
  { key: "missing_instagram", label: "인스타URL 미등록" },
];

export default function FilterBar({ search, onSearch, chip, onChip }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-[color:var(--color-border)]">
      <Input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="🔍 인물명·제목 검색..."
        className="max-w-xs"
      />
      <div className="flex gap-1">
        {CHIPS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChip(key)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              chip === key
                ? "bg-[color:var(--color-primary)] text-white border-[color:var(--color-primary)]"
                : "bg-white text-gray-600 border-[color:var(--color-border)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## Task 11: `KanbanBoard.tsx` + `KanbanColumn.tsx`

**Files:**
- Create: `app/dashboard-v2/_components/KanbanBoard.tsx`
- Create: `app/dashboard-v2/_components/KanbanColumn.tsx`

- [ ] **Step 11.1: KanbanBoard 작성**

```tsx
import type { KanbanGroups } from "@/lib/articles";
import { AGENCIES, AGENCY_SLUGS } from "@/lib/agencies";
import KanbanColumn from "./KanbanColumn";

type Props = { groups: KanbanGroups };

export default function KanbanBoard({ groups }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 p-4">
      {AGENCY_SLUGS.map((slug) => (
        <KanbanColumn key={slug} agency={slug} agencyInfo={AGENCIES[slug]} group={groups[slug]} />
      ))}
    </div>
  );
}
```

- [ ] **Step 11.2: KanbanColumn 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { AgencyGroup } from "@/lib/articles";
import type { AgencyInfo, AgencySlug } from "@/lib/agencies";
import ArticleCard from "./ArticleCard";

type Sort = "oldest" | "newest" | "name";

const AGENCY_COLOR: Record<AgencySlug, string> = {
  mih_speaker: "bg-[color:var(--color-speaker)]",
  mih_casting: "bg-[color:var(--color-casting)]",
  mih_agency: "bg-[color:var(--color-agency)]",
};

const LS_KEY = (a: string) => `dashboard-v2.sort.${a}`;

type Props = {
  agency: AgencySlug;
  agencyInfo: AgencyInfo;
  group: AgencyGroup;
};

export default function KanbanColumn({ agency, agencyInfo, group }: Props) {
  const [sort, setSort] = useState<Sort>("oldest");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY(agency)) : null;
    if (saved === "oldest" || saved === "newest" || saved === "name") setSort(saved);
  }, [agency]);

  const sortedPool = [...group.pool].sort((a, b) => {
    if (sort === "name") return a.person_name.localeCompare(b.person_name);
    if (sort === "newest") return b.created_at.localeCompare(a.created_at);
    return a.created_at.localeCompare(b.created_at);
  });

  function changeSort(next: Sort) {
    setSort(next);
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY(agency), next);
  }

  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-lg p-2.5 flex flex-col min-h-[360px]">
      <div className="flex items-start justify-between border-b border-gray-100 pb-2 mb-1.5">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-bold">
            <span className={`w-2 h-2 rounded-full ${AGENCY_COLOR[agency]}`} />
            {agencyInfo.blogSlug}
          </div>
          <div className="flex gap-0.5 mt-1">
            {(["oldest", "newest", "name"] as Sort[]).map((s) => (
              <button
                key={s}
                onClick={() => changeSort(s)}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  sort === s
                    ? "bg-[color:var(--color-primary)] text-white border-[color:var(--color-primary)]"
                    : "bg-white text-gray-600 border-[color:var(--color-border)]"
                }`}
              >
                {s === "oldest" ? "오래된순" : s === "newest" ? "최신" : "이름"}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[10px] text-[color:var(--color-text-muted)]">
          풀 <b className="text-gray-800">{group.pool.length}</b> · 오늘 <b className="text-gray-800">{group.today.length}</b>
        </div>
      </div>

      <Section label="📥 발행 대기" count={sortedPool.length} color="text-[color:var(--color-primary)]">
        {sortedPool.map((a) => <ArticleCard key={a.id} article={a} variant="pool" />)}
      </Section>

      <Section label="✓ 오늘 발행" count={group.today.length} color="text-[color:var(--color-agency)]">
        {group.today.map((a) => <ArticleCard key={a.id} article={a} variant="published" />)}
      </Section>

      <RecentSection articles={group.recent} />
    </div>
  );
}

function Section({ label, count, color, children }: { label: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5 first:mt-0">
      <div className={`text-[9px] font-bold uppercase tracking-wide flex justify-between items-center px-0.5 pt-1 pb-0.5 ${color}`}>
        <span>{label}</span>
        <span className="text-gray-500 font-medium">{count}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function RecentSection({ articles }: { articles: AgencyGroup["recent"] }) {
  const [open, setOpen] = useState(false);
  if (articles.length === 0) return null;
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-[9px] font-bold uppercase tracking-wide flex justify-between items-center px-0.5 pt-1 pb-0.5 text-gray-500 hover:text-gray-700"
      >
        <span>최근 발행</span>
        <span>{open ? "▾" : "▸"} {articles.length}</span>
      </button>
      {open && articles.map((a) => <ArticleCard key={a.id} article={a} variant="recent" />)}
    </div>
  );
}
```

---

## Task 12: `ArticleCard.tsx`

**Files:**
- Create: `app/dashboard-v2/_components/ArticleCard.tsx`

- [ ] **Step 12.1: 파일 작성**

```tsx
"use client";

import Link from "next/link";
import type { ArticleRow } from "@/lib/articles";

type Variant = "pool" | "published" | "recent";
type Props = { article: ArticleRow; variant: Variant };

function kstTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
}

export default function ArticleCard({ article, variant }: Props) {
  const opacityCls = variant === "recent" ? "opacity-70" : variant === "published" ? "opacity-90 bg-gray-50" : "";
  const missingInsta = article.instagram_url == null;

  return (
    <Link
      href={`/articles/${article.id}`}
      className={`block border border-[color:var(--color-border)] rounded mb-1 px-2 py-1.5 hover:border-[color:var(--color-primary)] hover:shadow-sm transition ${opacityCls}`}
    >
      <div className="flex items-center gap-1.5">
        <div className="font-semibold text-[11px] text-gray-900 truncate flex-1">{article.person_name}</div>
        {missingInsta && variant === "pool" && (
          <span className="text-[8px] bg-[color:var(--color-danger)] text-white px-1 rounded">인스타 ✕</span>
        )}
        {variant === "published" && article.published_at && (
          <span className="text-[8px] text-[color:var(--color-agency)] font-semibold">{kstTime(article.published_at)}</span>
        )}
      </div>
      <div className="text-[9px] text-[color:var(--color-text-muted)] mt-0.5">
        {variant === "pool" && `${article.created_at.slice(0, 10)} 추가`}
        {variant === "published" && `${article.agency} RSS 매칭`}
        {variant === "recent" && article.published_at && `${article.published_at.slice(0, 10)} 발행`}
      </div>
    </Link>
  );
}
```

---

## Task 13: 빌드 + 시각 검증 + 첫 커밋

**Files:** 없음

- [ ] **Step 13.1: 타입체크 / 빌드**

```bash
npm run build 2>&1 | tail -40
```
Expected: 빌드 성공. shadcn import 또는 컴포넌트 prop 타입 오류 없음.

오류가 있으면 해당 컴포넌트 파일을 다시 점검. 일반적 오류 패턴:
- `Cannot find module '@/components/ui/button'` → shadcn add 누락
- 타입 mismatch → ArticleRow / AgencyGroup 시그니처 정렬

- [ ] **Step 13.2: dev 서버에서 확인**

dev 서버가 켜져 있다면 자동 reload. 아니면:
```bash
npm run dev
```
http://localhost:3000/dashboard-v2 (또는 3002/dashboard-v2) 접속. 로그인 후:

- [ ] 3컬럼 칸반이 보임 (스피커/캐스팅/에이전시)
- [ ] 각 컬럼에 "발행 대기 / 오늘 발행 / 최근 발행" 섹션
- [ ] KPI 4종 상단 표시
- [ ] 검색 입력 + 필터 칩 동작
- [ ] 정렬 토글 (오래된순/최신/이름) 클릭 시 풀 재정렬
- [ ] localStorage에 정렬 저장 (새로고침 후 유지)

`/`는 기존 모습 그대로여야 함 — `/dashboard-v2`는 별도 라우트.

- [ ] **Step 13.3: 커밋**

```bash
git add app/dashboard-v2 lib/articles.ts tests/articles.test.ts
git commit -m "feat(dashboard-v2): 메인 칸반 페이지 (3컬럼 + KPI + 필터 + 정렬 토글)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: `app/articles/[id]/page.tsx` — 풀페이지

카드 클릭 시 진입. 모달이 없는 동안의 기본 동선 (Plan 3에서 모달이 추가되면 사용자 선택에 따라 풀페이지 또는 모달).

**Files:**
- Create: `app/articles/[id]/page.tsx`

- [ ] **Step 14.1: `_CopyButton.tsx` 작성 (client component)**

`app/articles/[id]/_CopyButton.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function CopyButton({ title }: { title: string }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(title);
      toast.success("제목을 복사했어요");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = title;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("제목을 복사했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={busy} size="sm">
      📋 제목 복사
    </Button>
  );
}
```

- [ ] **Step 14.2: `app/articles/[id]/page.tsx` 작성 (server component)**

```tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { AGENCIES, type AgencySlug } from "@/lib/agencies";
import { mergeWithBusinessCard, buildBusinessCardHtml } from "@/lib/business-card";
import type { ArticleRow } from "@/lib/articles";
import CopyButton from "./_CopyButton";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ArticlePage({ params }: Props) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("articles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return <main className="p-6 text-red-700">DB 조회 실패: {error.message}</main>;
  if (!data) return <main className="p-6">원고를 찾을 수 없습니다. <Link href="/dashboard-v2" className="text-blue-600 underline">← 목록으로</Link></main>;

  const article = data as ArticleRow & { html_content: string };
  const card = buildBusinessCardHtml(article.agency as AgencySlug);
  const merged = mergeWithBusinessCard(article.html_content ?? "", card);

  const srcDoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
body { margin:0; padding:24px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",Arial,sans-serif; color:#222; background:#fff; line-height:1.6; }
img { max-width:100%; height:auto; }
hr { border:none; border-top:1px solid #e0e0e0; margin:20px 0; }
</style></head><body>${merged}</body></html>`;

  return (
    <div className="min-h-screen bg-[color:var(--color-muted)]">
      <header className="bg-white border-b border-[color:var(--color-border)] px-4 py-2.5 flex items-center gap-3">
        <Link href="/dashboard-v2" className="text-sm text-gray-600 hover:text-gray-900">← 목록</Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold truncate">{article.title}</h1>
          <div className="text-xs text-[color:var(--color-text-muted)]">
            {AGENCIES[article.agency as AgencySlug].blogSlug} · {article.publish_date}
            {article.published_at ? ` · ${article.published_at.slice(0, 16).replace('T', ' ')} 발행` : ' · 미발행'}
          </div>
        </div>
        <CopyButton title={article.title} />
      </header>
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        className="w-full block"
        style={{ height: "calc(100vh - 56px)", border: 0, background: "#fff" }}
      />
    </div>
  );
}
```

- [ ] **Step 14.4: Toaster Provider 등록**

`app/layout.tsx`를 수정:

```tsx
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "메이드인헤븐 원고 관리",
  description: "원고 작성/모아보기/키워드 관리 (비공개)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
```

- [ ] **Step 14.5: 빌드 + dev 확인**

```bash
npm run build 2>&1 | tail -20
```
Expected: 빌드 성공.

dev에서 `/dashboard-v2` → 카드 클릭 → `/articles/<id>` 진입 → 본문 + 명함 자동 합성 확인 → 제목 복사 → toast 표시. 본문 드래그 → 복사 가능.

- [ ] **Step 14.6: 커밋**

```bash
git add app/articles app/layout.tsx
git commit -m "feat(article): /articles/[id] 풀페이지 (제목 복사 + 명함 자동 합성)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: 회귀 검증 + PR

**Files:** 없음

- [ ] **Step 15.1: 기존 페이지 회귀 점검**

| 경로 | 기대 |
|---|---|
| `/` (모아보기 기존) | 정상 — 캘린더 + 좌측 리스트 + iframe 미리보기 |
| `/keywords` | 정상 — 기존 keyword UI |
| `/rss` | 정상 — 기존 RSS 발행 현황 UI |
| `/login` | 정상 |
| `/dashboard-v2` (신규) | 칸반 3컬럼 + KPI + 필터 + 카드 클릭 |
| `/articles/[id]` (신규) | 풀페이지 미리보기 + 제목 복사 toast |

- [ ] **Step 15.2: 신규 publish 시 칸반 즉시 반영**

별도 셸에서:
```bash
npm run publish "output/2026-05-21/mih_agency/박혜신_[박혜신 섭외] ....html"
```
(테스트용 원고 또는 실제 원고 한 건. 이미 publish된 거 다시 호출 OK — upsert.)

`/dashboard-v2` 새로고침. 해당 원고가 발행 대기 풀 또는 적절한 섹션에 보이는지 확인.

- [ ] **Step 15.3: push + PR**

```bash
git push -u origin feat/dashboard-redesign-phase2-ui
gh pr create --base feat/dashboard-redesign-phase1 --title "Phase 2: 신규 UI 셸 (/dashboard-v2 + /articles/[id])" --body "$(cat <<'EOF'
## 요약

대시보드 UI 개편의 Phase 2 — 기존 `/`은 그대로 두고 `/dashboard-v2`에 신규 칸반 대시보드와 `/articles/[id]` 풀페이지를 구축. Tailwind v4 + shadcn/ui 도입.

상세 설계: `docs/superpowers/specs/2026-05-22-dashboard-redesign-design.md`
구현 계획: `docs/superpowers/plans/2026-05-22-dashboard-redesign-phase2-ui-shell.md`

## 변경 사항

### 신규 라우트
- `/dashboard-v2` — 3컬럼 칸반 (스피커/캐스팅/에이전시) · 발행 대기 풀/오늘 발행/최근 발행 섹션 · KPI 4종 · 검색+필터 칩 · 정렬 토글
- `/articles/[id]` — 풀페이지 미리보기 · 제목 복사 toast · 명함 자동 합성

### 도입 의존성
- Tailwind CSS v4
- shadcn/ui (button, card, badge, input, tabs, sonner)

### 무변경 (회귀 확인)
- `/` (기존 HomeView) · `/keywords` · `/rss` · `/login` 모두 그대로 동작

### 추출 / 리팩터
- `lib/business-card.ts` — HomeView에서 명함 합성 로직을 별도 모듈로 추출 (재사용 대비)
- `lib/articles.ts` — 칸반 그룹핑 + KPI 계산 헬퍼 (KST 기준, 단위 테스트 포함)

## 스코프 밖 (다음 Plan)

- **Plan 3:** 카드 모달 — 풀페이지를 부분 대체 + 메타 편집 인라인
- **Plan 4:** 신규 `/rss` 페이지 — 기간 차트·점검 항목·히트맵
- **Plan 5:** `/dashboard-v2` → `/` 스위치 오버, `/keywords` 제거, `keywords` 테이블 drop

## Test Plan

- [ ] `npm test` — articles.test.ts 통과
- [ ] `npm run build` 성공
- [ ] `/dashboard-v2` 칸반 정상 렌더 + 검색·필터·정렬 동작
- [ ] 카드 클릭 → `/articles/[id]` 진입 + 제목 복사 toast
- [ ] 본문 드래그 복사 시 명함이 카카오 링크 직전에 합성됨
- [ ] 기존 `/`, `/keywords`, `/rss` 무변경 회귀 확인
- [ ] 신규 `npm run publish` 후 `/dashboard-v2` 새로고침 시 즉시 반영

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## 완료 기준 (DoD)

- [ ] Tailwind v4 + shadcn/ui 셋업 완료, 빌드 성공
- [ ] `/dashboard-v2` 칸반 3컬럼 정상 렌더 (스피커/캐스팅/에이전시)
- [ ] 각 컬럼에 발행 대기 풀 / 오늘 발행 / 최근 발행 섹션
- [ ] KPI 4종 (대기 풀 / 오늘 발행 / 이번 주 / RSS 미매칭) 표시
- [ ] 검색 + 4종 필터 칩 동작
- [ ] 정렬 토글 동작 + localStorage 저장
- [ ] 카드 클릭 → `/articles/[id]` 풀페이지 이동
- [ ] 풀페이지에서 제목 복사 toast + 본문 드래그 복사 가능
- [ ] 명함 자동 합성이 카카오 링크 직전 위치에 정확히
- [ ] 기존 `/`, `/keywords`, `/rss`, `/login` 무변경 회귀
- [ ] `tests/articles.test.ts` 통과
- [ ] PR 생성

---

## 스코프 밖 (다음 Plan)

- **카드 모달** — 클릭 시 모달, 이전/다음 키 순회, 좌측 메타 편집 패널. Plan 3에서 풀페이지를 부분 대체.
- **메타 편집** — 인스타 URL, 카테고리, 노트 인라인 편집 + PATCH API.
- **발행됨 수동 토글** — Switch UI + API.
- **신규 `/rss` 페이지** — 기간별 차트, KPI, 점검 항목, 히트맵. Plan 4.
- **`/dashboard-v2` → `/` 스위치 오버** — Plan 5.
- **`keywords` 테이블 drop** — Plan 5.

---

## 스펙과의 매핑

| 스펙 섹션 | 이 plan의 task |
|---|---|
| 5.1 페이지 구조 (`/dashboard-v2`, `/articles/[id]`) | Task 6, 14 |
| 6 컴포넌트 트리 (DashboardClient/TopBar/KpiStrip/FilterBar/KanbanBoard/KanbanColumn/ArticleCard) | Task 7~12 |
| 7.5 정렬 토글 + localStorage | Task 11 |
| 7.6 검색·필터 | Task 7, 10 |
| 9 디자인 토큰 (Tailwind 변수) | Task 2 |
| 카드 → 풀페이지 동선 | Task 12, 14 |
| 명함 자동 합성 보존 | Task 4, 14 |
