# 대시보드 개편 Phase 4 — 신규 `/rss-v2` 발행 현황 페이지

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** 기존 `/rss`(정적 HTML)는 그대로 두고 `/rss-v2`에 분석 중심의 신규 발행 현황 페이지를 구축. KPI 4종 + 계정별 일자 발행 막대 차트 + 점검 필요 항목 + 30일 히트맵 + 수동 RSS 동기화 + CSV 내보내기.

**Architecture:** Server Component(`page.tsx`)에서 기간 파라미터를 받아 articles 집계를 한 번에 fetch한 뒤 `RssClient`에 넘긴다. 차트는 raw SVG로 직접 그려서 의존성 최소화(recharts 등 외부 패키지 추가 없음). 수동 동기화 버튼은 새 `POST /api/rss-sync` 프록시로 Edge Function 호출.

**Tech Stack:** Next.js 15 App Router, Server Component + Client Island, raw SVG, Tailwind v4

**관련 스펙:** `docs/superpowers/specs/2026-05-22-dashboard-redesign-design.md` 섹션 8

---

## 사전 준비

- Phase 3 (`feat/dashboard-redesign-phase3-modal`) 위에서 분기
- 작업 브랜치: `feat/dashboard-redesign-phase4-rss`
- `articles.published_at`, `unmatched_rss_items` 사용 가능 (Phase 1에서 구축)

---

## 파일 구조

```
app/
├── rss-v2/
│   ├── page.tsx                                (NEW — Server)
│   └── _components/
│       ├── RssClient.tsx                       (NEW — "use client" 루트)
│       ├── RangePicker.tsx                     (NEW — 7/14/30일/사용자)
│       ├── KpiCards.tsx                        (NEW)
│       ├── AgencyChart.tsx                     (NEW — 막대 차트 SVG)
│       ├── DiagnosticList.tsx                  (NEW — 점검 항목)
│       ├── PublishHeatmap.tsx                  (NEW)
│       └── ActionsBar.tsx                      (NEW — 수동 동기화 + CSV)
├── api/
│   └── rss-sync/
│       └── route.ts                            (NEW — Edge Function 프록시)
lib/
└── rss-stats.ts                                (NEW — 집계 헬퍼 + 단위 테스트)
tests/
└── rss-stats.test.ts                           (NEW)
```

`TopBar.tsx`의 "발행 현황" 링크는 `/rss` 그대로 둔다 (Phase 5에서 `/rss-v2` → `/rss` 스위치).

---

## Task 1: 브랜치 분기

- [ ] **Step 1.1**

```bash
git status                              # clean 확인
git switch -c feat/dashboard-redesign-phase4-rss feat/dashboard-redesign-phase3-modal
```

---

## Task 2: `lib/rss-stats.ts` + 테스트 (TDD)

기간 안의 articles를 받아 KPI·일자별·계정별·히트맵 데이터를 계산하는 순수 함수. KST 기준.

**Files:**
- Create: `lib/rss-stats.ts`
- Test: `tests/rss-stats.test.ts`

- [ ] **Step 2.1: 실패 테스트**

```ts
import { describe, it, expect } from 'vitest';
import { computeRssStats, type RssStatsInput, type RssStatsArticle } from '@/lib/rss-stats';
import type { AgencySlug } from '@/lib/agencies';

function mk(over: Partial<RssStatsArticle>): RssStatsArticle {
  return {
    id: 'a', agency: 'mih_speaker', created_at: '2026-05-01T00:00:00Z',
    published_at: null, ...over,
  };
}

describe('computeRssStats', () => {
  const range = { startMs: Date.parse('2026-05-09T00:00:00+09:00'), endMs: Date.parse('2026-05-23T00:00:00+09:00') };

  it('counts total published in range', () => {
    const stats = computeRssStats({
      range, articles: [
        mk({ id: 'p1', published_at: '2026-05-10T05:00:00+09:00' }),
        mk({ id: 'p2', published_at: '2026-05-12T05:00:00+09:00' }),
        mk({ id: 'out', published_at: '2026-05-08T05:00:00+09:00' }), // 범위 밖
      ],
      unmatchedCount: 0,
    });
    expect(stats.totalPublished).toBe(2);
  });

  it('computes daily totals per agency', () => {
    const stats = computeRssStats({
      range, articles: [
        mk({ agency: 'mih_speaker', published_at: '2026-05-10T05:00:00+09:00' }),
        mk({ agency: 'mih_speaker', published_at: '2026-05-10T06:00:00+09:00' }),
        mk({ agency: 'mih_casting', published_at: '2026-05-10T07:00:00+09:00' }),
      ],
      unmatchedCount: 0,
    });
    const may10 = stats.daily.find((d) => d.date === '2026-05-10');
    expect(may10).toBeDefined();
    expect(may10!.mih_speaker).toBe(2);
    expect(may10!.mih_casting).toBe(1);
    expect(may10!.mih_agency).toBe(0);
  });

  it('flags days with zero publish as suspect', () => {
    const stats = computeRssStats({
      range, articles: [
        mk({ published_at: '2026-05-10T05:00:00+09:00' }),
        // 5/11 ~ 5/22 모두 없음
      ],
      unmatchedCount: 0,
    });
    expect(stats.zeroDaysCount).toBeGreaterThan(0);
  });

  it('computes goal achievement percent (10/day target)', () => {
    // 14일 × 10 = 140 목표
    const articles: RssStatsArticle[] = [];
    for (let i = 0; i < 70; i++) {
      articles.push(mk({ id: `p${i}`, published_at: '2026-05-15T05:00:00+09:00' }));
    }
    const stats = computeRssStats({ range, articles, unmatchedCount: 0 });
    expect(stats.goalPercent).toBe(50);  // 70 / 140
  });

  it('per-agency aggregate (period total, avg per day, match rate placeholder=100%)', () => {
    const stats = computeRssStats({
      range, articles: [
        mk({ agency: 'mih_speaker', published_at: '2026-05-10T05:00:00+09:00' }),
        mk({ agency: 'mih_speaker', published_at: '2026-05-11T05:00:00+09:00' }),
        mk({ agency: 'mih_casting', published_at: '2026-05-12T05:00:00+09:00' }),
      ],
      unmatchedCount: 1,
    });
    expect(stats.byAgency.mih_speaker.periodTotal).toBe(2);
    expect(stats.byAgency.mih_casting.periodTotal).toBe(1);
    expect(stats.byAgency.mih_agency.periodTotal).toBe(0);
  });
});
```

- [ ] **Step 2.2: 실패 확인**

```bash
npm test -- tests/rss-stats.test.ts
```

- [ ] **Step 2.3: 구현**

```ts
import type { AgencySlug } from '@/lib/agencies';

export type RssStatsArticle = {
  id: string;
  agency: AgencySlug;
  created_at: string;
  published_at: string | null;
};

export type DailyBucket = {
  date: string;  // YYYY-MM-DD (KST)
  mih_speaker: number;
  mih_casting: number;
  mih_agency: number;
};

export type AgencyAggregate = {
  periodTotal: number;
  avgPerDay: number;
};

export type RssStats = {
  totalPublished: number;
  goalPercent: number;
  zeroDaysCount: number;
  unmatchedCount: number;
  daily: DailyBucket[];
  byAgency: Record<AgencySlug, AgencyAggregate>;
};

export type RssStatsInput = {
  range: { startMs: number; endMs: number };  // KST 자정 기준 endMs 비포함
  articles: RssStatsArticle[];
  unmatchedCount: number;
};

const KST_OFFSET_MS = 9 * 3600_000;
const DAILY_TARGET = 10;

function kstDateString(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function computeRssStats(input: RssStatsInput): RssStats {
  const { range, articles, unmatchedCount } = input;
  const dayCount = Math.round((range.endMs - range.startMs) / 86400_000);
  const target = dayCount * DAILY_TARGET;

  const byDate = new Map<string, DailyBucket>();
  for (let d = 0; d < dayCount; d++) {
    const ms = range.startMs + d * 86400_000;
    const date = kstDateString(ms);
    byDate.set(date, { date, mih_speaker: 0, mih_casting: 0, mih_agency: 0 });
  }

  const byAgency: Record<AgencySlug, AgencyAggregate> = {
    mih_speaker: { periodTotal: 0, avgPerDay: 0 },
    mih_casting: { periodTotal: 0, avgPerDay: 0 },
    mih_agency: { periodTotal: 0, avgPerDay: 0 },
  };

  let totalPublished = 0;
  for (const a of articles) {
    if (a.published_at == null) continue;
    const t = Date.parse(a.published_at);
    if (t < range.startMs || t >= range.endMs) continue;
    const date = kstDateString(t);
    const bucket = byDate.get(date);
    if (!bucket) continue;
    bucket[a.agency]++;
    byAgency[a.agency].periodTotal++;
    totalPublished++;
  }

  for (const slug of Object.keys(byAgency) as AgencySlug[]) {
    byAgency[slug].avgPerDay = dayCount > 0 ? +(byAgency[slug].periodTotal / dayCount).toFixed(1) : 0;
  }

  const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const zeroDaysCount = daily.filter((d) => d.mih_speaker + d.mih_casting + d.mih_agency === 0).length;
  const goalPercent = target > 0 ? Math.round((totalPublished / target) * 100) : 0;

  return { totalPublished, goalPercent, zeroDaysCount, unmatchedCount, daily, byAgency };
}
```

- [ ] **Step 2.4: 통과 확인**

```bash
npm test
```
Expected: 28 + 5 = 33 passed.

- [ ] **Step 2.5: 커밋**

```bash
git add lib/rss-stats.ts tests/rss-stats.test.ts
git commit -m "feat(rss-stats): 발행 현황 집계 헬퍼 (KPI + 일자별 + 계정별)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 수동 RSS 동기화 API 프록시

`POST /api/rss-sync` — 인증 사용자가 Edge Function `rss-sync` 즉시 호출.

**Files:**
- Create: `app/api/rss-sync/route.ts`

- [ ] **Step 3.1**

```ts
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "env missing" }, { status: 500 });
  }

  const projectRef = new URL(url).host.split(".")[0];
  const fnUrl = `https://${projectRef}.functions.supabase.co/rss-sync`;

  try {
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    return new NextResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3.2: 커밋**

```bash
git add app/api/rss-sync/route.ts
git commit -m "feat(api): POST /api/rss-sync (Edge Function 수동 트리거 프록시)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `/rss-v2/page.tsx` — Server fetch

기간을 쿼리에서 받아(`?days=14`) articles + unmatched 집계 → RssClient에 전달.

**Files:**
- Create: `app/rss-v2/page.tsx`

- [ ] **Step 4.1**

```tsx
import { supabaseAdmin } from "@/lib/supabase";
import { computeRssStats } from "@/lib/rss-stats";
import type { AgencySlug } from "@/lib/agencies";
import { isAgencySlug } from "@/lib/agencies";
import RssClient from "./_components/RssClient";

export const dynamic = "force-dynamic";

const KST_OFFSET_MS = 9 * 3600_000;
function kstMidnightMs(now = Date.now()): number {
  return Math.floor((now + KST_OFFSET_MS) / 86400_000) * 86400_000 - KST_OFFSET_MS;
}

type Search = { days?: string };

export default async function RssV2Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const days = Math.min(90, Math.max(7, parseInt(sp.days ?? "14", 10) || 14));

  const tomorrowStart = kstMidnightMs() + 86400_000;
  const startMs = tomorrowStart - days * 86400_000;
  const endMs = tomorrowStart;  // exclusive

  const sb = supabaseAdmin();
  const [aRes, uRes, recentUnmatched] = await Promise.all([
    sb.from("articles")
      .select("id,agency,created_at,published_at")
      .not("published_at", "is", null)
      .gte("published_at", new Date(startMs).toISOString())
      .lt("published_at", new Date(endMs).toISOString()),
    sb.from("unmatched_rss_items").select("agency", { count: "exact", head: true }),
    sb.from("unmatched_rss_items")
      .select("agency,title,link,pub_ts,last_seen_at")
      .order("pub_ts", { ascending: false })
      .limit(20),
  ]);

  if (aRes.error) return <main className="p-6 text-red-700">DB: {aRes.error.message}</main>;

  const articles = (aRes.data || []).filter((a) => isAgencySlug(a.agency)) as Array<{
    id: string; agency: AgencySlug; created_at: string; published_at: string;
  }>;

  const stats = computeRssStats({
    range: { startMs, endMs },
    articles: articles.map((a) => ({ id: a.id, agency: a.agency, created_at: a.created_at, published_at: a.published_at })),
    unmatchedCount: uRes.count ?? 0,
  });

  return (
    <RssClient
      days={days}
      stats={stats}
      unmatchedSample={(recentUnmatched.data ?? []) as { agency: AgencySlug; title: string; link: string; pub_ts: number; last_seen_at: string }[]}
    />
  );
}
```

---

## Task 5: Client components 일괄 작성

다음 5개를 한 묶음으로 작성 후 한 커밋. 각각 독립적이지만 RssClient가 그들을 조립.

**Files:**
- Create: `app/rss-v2/_components/RssClient.tsx`
- Create: `app/rss-v2/_components/RangePicker.tsx`
- Create: `app/rss-v2/_components/KpiCards.tsx`
- Create: `app/rss-v2/_components/AgencyChart.tsx`
- Create: `app/rss-v2/_components/DiagnosticList.tsx`
- Create: `app/rss-v2/_components/PublishHeatmap.tsx`
- Create: `app/rss-v2/_components/ActionsBar.tsx`

### RssClient.tsx

```tsx
"use client";

import type { RssStats } from "@/lib/rss-stats";
import type { AgencySlug } from "@/lib/agencies";
import RangePicker from "./RangePicker";
import KpiCards from "./KpiCards";
import AgencyChart from "./AgencyChart";
import DiagnosticList from "./DiagnosticList";
import PublishHeatmap from "./PublishHeatmap";
import ActionsBar from "./ActionsBar";

type UnmatchedItem = { agency: AgencySlug; title: string; link: string; pub_ts: number; last_seen_at: string };

type Props = {
  days: number;
  stats: RssStats;
  unmatchedSample: UnmatchedItem[];
};

export default function RssClient({ days, stats, unmatchedSample }: Props) {
  return (
    <div className="min-h-screen bg-[color:var(--color-muted)]">
      <header className="bg-white border-b border-[color:var(--color-border)] px-4 py-2.5 flex items-center gap-3">
        <a href="/dashboard-v2" className="text-sm text-gray-600 hover:text-gray-900">← 모아보기</a>
        <h1 className="text-sm font-bold flex-1">발행 현황</h1>
        <ActionsBar />
      </header>

      <div className="px-4 py-3 bg-white border-b border-[color:var(--color-border)] flex items-center gap-3">
        <RangePicker days={days} />
        <span className="text-xs text-gray-500">최근 {days}일</span>
      </div>

      <KpiCards stats={stats} days={days} />

      <div className="grid grid-cols-[1fr_360px] gap-3 p-4">
        <div className="bg-white border border-[color:var(--color-border)] rounded-lg p-4">
          <h2 className="text-sm font-bold mb-2">계정별 일자 발행 추이</h2>
          <AgencyChart daily={stats.daily} />
        </div>
        <div className="bg-white border border-[color:var(--color-border)] rounded-lg p-4">
          <h2 className="text-sm font-bold mb-2">점검 필요 항목</h2>
          <DiagnosticList stats={stats} unmatchedSample={unmatchedSample} />
        </div>
      </div>

      <div className="p-4">
        <div className="bg-white border border-[color:var(--color-border)] rounded-lg p-4">
          <h2 className="text-sm font-bold mb-2">30일 히트맵</h2>
          <PublishHeatmap daily={stats.daily} />
        </div>
      </div>
    </div>
  );
}
```

### RangePicker.tsx

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [7, 14, 30];

export default function RangePicker({ days }: { days: number }) {
  const router = useRouter();
  const sp = useSearchParams();

  function set(d: number) {
    const next = new URLSearchParams(sp.toString());
    next.set("days", String(d));
    router.push(`/rss-v2?${next.toString()}`);
  }

  return (
    <div className="flex gap-0 border border-[color:var(--color-border)] rounded overflow-hidden text-xs">
      {OPTIONS.map((d) => (
        <button
          key={d}
          onClick={() => set(d)}
          className={`px-3 py-1.5 border-r last:border-r-0 border-[color:var(--color-border)] ${
            d === days ? "bg-[color:var(--color-primary)] text-white" : "bg-white text-gray-600"
          }`}
        >
          {d}일
        </button>
      ))}
    </div>
  );
}
```

### KpiCards.tsx

```tsx
import type { RssStats } from "@/lib/rss-stats";

type Props = { stats: RssStats; days: number };

export default function KpiCards({ stats, days }: Props) {
  const target = days * 10;
  return (
    <div className="grid grid-cols-4 gap-3 px-4 py-3">
      <Card label="기간 발행 합계" main={stats.totalPublished} sub={`하루 평균 ${(stats.totalPublished / days).toFixed(1)}건`} tone="text-[color:var(--color-agency)]" />
      <Card label="목표 달성률" main={`${stats.goalPercent}%`} sub={`${days}일 × 10건 = ${target} / 실 ${stats.totalPublished}`} tone="text-[color:var(--color-primary)]" />
      <Card label="RSS 미매칭 ⚠" main={stats.unmatchedCount} sub="DB에 없는 RSS 항목 — 확인 필요" tone="text-[color:var(--color-warning)]" />
      <Card label="발행 누락 의심" main={stats.zeroDaysCount} sub="하루 0건 발행된 날" tone="text-[color:var(--color-danger)]" />
    </div>
  );
}

function Card({ label, main, sub, tone }: { label: string; main: number | string; sub: string; tone: string }) {
  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-md px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${tone}`}>{main}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}
```

### AgencyChart.tsx

```tsx
"use client";

import type { DailyBucket } from "@/lib/rss-stats";

type Props = { daily: DailyBucket[] };

const COLORS = {
  mih_speaker: "#1565C0",
  mih_casting: "#7B1FA2",
  mih_agency: "#2E7D32",
};

export default function AgencyChart({ daily }: Props) {
  if (daily.length === 0) return <div className="text-xs text-gray-400">데이터 없음</div>;

  const max = Math.max(10, ...daily.map((d) => d.mih_speaker + d.mih_casting + d.mih_agency));
  const W = 800;
  const H = 200;
  const PAD = { top: 10, right: 10, bottom: 24, left: 30 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const bw = innerW / daily.length;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* y axis ticks (0, max/2, max) */}
        {[0, max / 2, max].map((v) => {
          const y = PAD.top + innerH - (v / max) * innerH;
          return (
            <g key={v}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#eef0f3" />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize="10" fill="#aaa">{Math.round(v)}</text>
            </g>
          );
        })}
        {daily.map((d, i) => {
          const x = PAD.left + i * bw + bw * 0.15;
          const w = bw * 0.7;
          const total = d.mih_speaker + d.mih_casting + d.mih_agency;
          if (total === 0) return null;
          const speakerH = (d.mih_speaker / max) * innerH;
          const castingH = (d.mih_casting / max) * innerH;
          const agencyH = (d.mih_agency / max) * innerH;
          const speakerY = PAD.top + innerH - speakerH;
          const castingY = speakerY - castingH;
          const agencyY = castingY - agencyH;
          return (
            <g key={d.date}>
              <rect x={x} y={agencyY} width={w} height={agencyH} fill={COLORS.mih_agency} />
              <rect x={x} y={castingY} width={w} height={castingH} fill={COLORS.mih_casting} />
              <rect x={x} y={speakerY} width={w} height={speakerH} fill={COLORS.mih_speaker} />
            </g>
          );
        })}
        {daily.map((d, i) => {
          if (i % Math.ceil(daily.length / 14) !== 0) return null;
          const x = PAD.left + i * bw + bw / 2;
          const label = d.date.slice(5);
          return <text key={d.date} x={x} y={H - 8} textAnchor="middle" fontSize="9" fill="#aaa">{label}</text>;
        })}
      </svg>
      <div className="flex gap-3 text-[10px] text-gray-600 justify-center mt-1">
        {(["mih_speaker", "mih_casting", "mih_agency"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: COLORS[k] }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
```

### DiagnosticList.tsx

```tsx
import type { RssStats } from "@/lib/rss-stats";
import type { AgencySlug } from "@/lib/agencies";

type UnmatchedItem = { agency: AgencySlug; title: string; link: string; pub_ts: number; last_seen_at: string };
type Props = { stats: RssStats; unmatchedSample: UnmatchedItem[] };

export default function DiagnosticList({ stats, unmatchedSample }: Props) {
  return (
    <div className="space-y-2 text-xs">
      {stats.zeroDaysCount > 0 && (
        <Alert tone="bad" title={`${stats.zeroDaysCount}일 발행 0건`} sub="하루 0건으로 떨어진 날 — 의도된 휴일이 아니면 점검" />
      )}
      {stats.unmatchedCount > 0 && (
        <Alert tone="warn" title={`RSS에 있으나 DB에 없음 ${stats.unmatchedCount}건`} sub="네이버에서 직접 작성됐을 가능성. 아래 샘플 참고." />
      )}
      {stats.zeroDaysCount === 0 && stats.unmatchedCount === 0 && (
        <Alert tone="ok" title="이상 없음" sub="이 기간에 점검할 항목이 없습니다" />
      )}
      {unmatchedSample.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wide">최근 미매칭 샘플</div>
          {unmatchedSample.slice(0, 5).map((u) => (
            <a key={u.link} href={u.link} target="_blank" rel="noopener" className="block py-1 hover:bg-gray-50 rounded px-1">
              <div className="text-xs text-gray-800 truncate">{u.title}</div>
              <div className="text-[10px] text-gray-400">{u.agency} · {new Date(u.pub_ts).toLocaleString("ko-KR")}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Alert({ tone, title, sub }: { tone: "ok" | "warn" | "bad"; title: string; sub: string }) {
  const cls =
    tone === "ok" ? "bg-green-50 border-green-200 text-green-900" :
    tone === "warn" ? "bg-yellow-50 border-yellow-200 text-yellow-900" :
    "bg-red-50 border-red-200 text-red-900";
  return (
    <div className={`rounded-md border px-3 py-2 ${cls}`}>
      <div className="font-semibold text-xs">{title}</div>
      <div className="text-[10px] opacity-80 mt-0.5">{sub}</div>
    </div>
  );
}
```

### PublishHeatmap.tsx

```tsx
import type { DailyBucket } from "@/lib/rss-stats";

type Props = { daily: DailyBucket[] };

function intensity(total: number): string {
  if (total === 0) return "bg-gray-100";
  if (total < 5) return "bg-blue-100";
  if (total < 8) return "bg-blue-300";
  if (total < 11) return "bg-blue-500";
  return "bg-blue-700";
}

export default function PublishHeatmap({ daily }: Props) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(daily.length, 14)}, minmax(0, 1fr))` }}>
      {daily.map((d) => {
        const total = d.mih_speaker + d.mih_casting + d.mih_agency;
        const cls = intensity(total);
        return (
          <div
            key={d.date}
            title={`${d.date} · ${total}건 (S:${d.mih_speaker} / C:${d.mih_casting} / A:${d.mih_agency})`}
            className={`aspect-square rounded text-[9px] flex items-center justify-center ${cls} ${total >= 5 ? "text-white" : "text-gray-600"}`}
          >
            {total}
          </div>
        );
      })}
    </div>
  );
}
```

### ActionsBar.tsx

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function ActionsBar() {
  const [busy, setBusy] = useState<"sync" | "csv" | null>(null);
  const router = useRouter();

  async function sync() {
    setBusy("sync");
    try {
      const res = await fetch("/api/rss-sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok || body?.ok === false) throw new Error(body?.error ?? `HTTP ${res.status}`);
      toast.success(`동기화 완료: ${body.matched ?? 0}건 매칭`);
      router.refresh();
    } catch (e) {
      toast.error("동기화 실패: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function csv() {
    setBusy("csv");
    try {
      const url = location.pathname + location.search;
      const r = await fetch(`/api/articles-export${location.search || ""}`).catch(() => null);
      // 단순 client-side: 현재 페이지의 데이터를 가져오는 경량 CSV는 별도 endpoint 필요. 일단 안내.
      if (!r || !r.ok) {
        toast.message("CSV 내보내기는 별도 endpoint 필요 — 추후 Plan 5에서 추가 예정");
        return;
      }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `rss-stats-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button onClick={sync} disabled={busy !== null} size="sm">{busy === "sync" ? "동기화 중…" : "↻ 지금 동기화"}</Button>
      <Button onClick={csv} disabled={busy !== null} size="sm" variant="outline">📥 CSV</Button>
    </div>
  );
}
```

- [ ] **Step 5.1: 모든 컴포넌트 파일 작성**

- [ ] **Step 5.2: 빌드 + dev 확인**

```bash
npm run build 2>&1 | tail -10
```
Expected: 빌드 성공. `/rss-v2` 라우트 등록.

dev에서 http://localhost:3005/rss-v2 접속 → KPI/차트/점검/히트맵 표시.

- [ ] **Step 5.3: 커밋**

```bash
git add app/rss-v2 app/api/rss-sync
git commit -m "feat(rss-v2): 신규 발행 현황 페이지 (KPI/차트/점검/히트맵/동기화)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: TopBar 링크 추가 (선택 — 사용자 접근 편의)

기존 TopBar의 "발행 현황" 링크는 `/rss`로 유지. Phase 5에서 `/rss`로 스위치. Phase 4 동안엔 직접 URL로 접근하거나 별도 링크.

**Files:**
- Modify: `app/dashboard-v2/_components/TopBar.tsx`

- [ ] **Step 6.1**

`/rss` 링크 옆에 `/rss-v2` 링크를 임시로 추가 (회색·작게). Phase 5에서 제거.

```tsx
<Link href="/rss" className="px-3 py-1 text-sm rounded text-gray-600 hover:bg-gray-50">발행 현황</Link>
<Link href="/rss-v2" className="px-2 py-1 text-[10px] rounded text-blue-600 hover:bg-blue-50">v2(베타)</Link>
```

- [ ] **Step 6.2: 커밋**

```bash
git add app/dashboard-v2/_components/TopBar.tsx
git commit -m "chore(top-bar): /rss-v2 베타 링크 임시 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 검증 + PR

- [ ] **Step 7.1: 회귀**

| 경로 | 기대 |
|---|---|
| `/` | 무변경 |
| `/dashboard-v2` | 무변경 (모달 동작) |
| `/rss` | 기존 그대로 |
| `/rss-v2` | KPI/차트/점검/히트맵, 동기화 버튼 동작 |
| `/article/[id]` | 무변경 |

- [ ] **Step 7.2: push + PR**

```bash
git push -u origin feat/dashboard-redesign-phase4-rss
gh pr create --base feat/dashboard-redesign-phase3-modal --head feat/dashboard-redesign-phase4-rss --title "Phase 4: 신규 /rss-v2 발행 현황 (KPI/차트/점검/히트맵)" --body "..."
```

PR body:
```
## 요약

기존 /rss(정적 HTML)는 보존, 신규 /rss-v2에 분석 중심 페이지 구축.

### 신규
- /rss-v2: KPI 4종 / 계정별 일자 발행 막대 차트(SVG) / 점검 필요 항목 / 30일 히트맵 / 수동 동기화 / 기간 선택
- /api/rss-sync POST 프록시 (Edge Function 즉시 호출)
- lib/rss-stats.ts + 단위 테스트 5개
- TopBar에 /rss-v2 베타 링크 임시 추가 (Phase 5에서 / 로 스위치)

### 무변경
- /, /dashboard-v2, /rss, /article/[id], /keywords, /login

### Test Plan
- [x] npm test (33 passed)
- [x] npm run build
- [ ] /rss-v2 KPI/차트/점검/히트맵 시각 확인 (수동)
- [ ] "지금 동기화" 클릭 → toast (수동)
- [ ] 기간 7/14/30일 토글 (수동)
```

---

## 완료 기준 (DoD)

- [ ] `/rss-v2` 정상 렌더 (KPI/차트/점검/히트맵)
- [ ] 기간 선택 (7/14/30) 동작
- [ ] "지금 동기화" 버튼 → Edge Function 호출 + toast
- [ ] `lib/rss-stats.ts` 5개 테스트 통과
- [ ] 기존 페이지 무변경

---

## 스코프 밖

- 사용자 지정 기간(custom date range picker)
- 실제 CSV 내보내기 (별도 endpoint 필요 — Plan 5 또는 별도 PR)
- 차트 hover/tooltip
- `/rss-v2` → `/rss` 스위치 — Plan 5
- 14일·30일 이상 차트의 x축 라벨 자동 조정 (현재 매 N개마다 라벨)
