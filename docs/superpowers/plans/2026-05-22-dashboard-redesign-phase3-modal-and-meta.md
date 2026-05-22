# 대시보드 개편 Phase 3 — 카드 모달 + 메타 편집

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 칸반 카드 클릭의 기본 동선을 `/article/[id]` 풀페이지 이동에서 **중앙 큰 모달**로 변경한다. 모달 안에서 미리보기·제목/원고 복사·메타 편집(인스타 URL · 카테고리 · 노트)·발행됨 수동 토글이 모두 끝난다. 풀페이지는 그대로 두어 ↗ 열기·URL 공유용으로 유지.

**Architecture:** shadcn `Dialog`(Radix)로 중앙 모달. 모달 상태는 `?article=<id>` 쿼리 파라미터로 URL 동기화 — 새로고침/뒤로가기로 복원 가능. 모달 본체는 server fetch 없이 client-side에서 `/api/manuscripts/[id]` 호출로 html_content를 가져온다(이미 lazy fetch 패턴 사용 중). 메타 편집은 신규 `PATCH /api/articles/[id]` 로 보내고 optimistic update.

**Tech Stack:** Next.js 15 App Router, shadcn/ui Dialog/Switch/Textarea/Label, React 19 useTransition, sonner toast

**관련 스펙:** `docs/superpowers/specs/2026-05-22-dashboard-redesign-design.md` 섹션 7 (인터랙션) · 6 (컴포넌트 트리)

---

## 사전 준비 / 가정

- Phase 2 PR(`feat/dashboard-redesign-phase2-ui`)이 merge되었거나 base로 분기 가능한 상태
- 작업 브랜치: `feat/dashboard-redesign-phase3-modal` (Phase 2 위에서 분기)
- `/dashboard-v2` 와 `/article/[id]` 가 정상 동작
- shadcn `dialog`, `switch`, `textarea`, `label` 컴포넌트는 아직 없음 — 이 plan에서 추가
- `articles` 테이블에 `instagram_url`, `category`, `notes`, `published_at`, `published_url`, `published_source` 컬럼 존재 (Phase 1)

---

## 파일 구조

```
app/
├── dashboard-v2/
│   ├── page.tsx                                        (NO CHANGE)
│   └── _components/
│       ├── DashboardClient.tsx                         (MODIFY — 모달 상태 + 키보드 핸들러)
│       ├── ArticleCard.tsx                             (MODIFY — onClick으로 모달 오픈)
│       ├── ArticleModal.tsx                            (NEW — Dialog 루트)
│       ├── ArticleModalMeta.tsx                        (NEW — 좌측 메타 편집 폼)
│       └── ArticleModalPreview.tsx                     (NEW — 우측 미리보기 iframe)
├── article/[id]/page.tsx                               (NO CHANGE — 풀페이지 유지)
└── api/articles/[id]/route.ts                          (NEW — PATCH 메타 업데이트)
components/ui/
├── dialog.tsx                                          (NEW — shadcn add)
├── switch.tsx                                          (NEW — shadcn add)
├── textarea.tsx                                        (NEW — shadcn add)
└── label.tsx                                           (NEW — shadcn add)
lib/
└── articles.ts                                         (MODIFY — flatList helper 추가 for 순회)
```

---

## Task 1: 작업 브랜치 분기 + shadcn 컴포넌트 추가

**Files:**
- 없음 (`components/ui/*` 는 CLI가 생성)

- [ ] **Step 1.1: 브랜치 분기**

```bash
git status   # clean 확인
git switch -c feat/dashboard-redesign-phase3-modal feat/dashboard-redesign-phase2-ui
```

(Phase 2가 main에 merge됐으면 `feat/dashboard-redesign-phase2-ui` 대신 `main` 사용 + `git pull`.)

- [ ] **Step 1.2: shadcn 추가 컴포넌트 설치**

```bash
npx shadcn@latest add dialog switch textarea label
```

생성: `components/ui/dialog.tsx`, `switch.tsx`, `textarea.tsx`, `label.tsx`. 일부 패키지가 추가될 수 있음 (`@radix-ui/react-dialog` 등) — 자동 설치.

- [ ] **Step 1.3: 빌드 통과 확인**

```bash
npm run build 2>&1 | tail -10
```
Expected: 빌드 성공.

- [ ] **Step 1.4: 커밋**

```bash
git add components/ui/ components.json package.json package-lock.json
git commit -m "chore: shadcn dialog/switch/textarea/label 추가 (Phase 3 모달용)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PATCH API — `app/api/articles/[id]/route.ts`

메타(`instagram_url`, `category`, `notes`)와 발행 상태(`published_at`, `published_url`, `published_source`)를 업데이트한다. 새 라우트지만 기존 `/api/manuscripts/[id]` 와는 책임 분리(GET만 / 메타 편집)되어 별도. Phase 5에서 manuscripts → articles 별칭 정리 예정.

**Files:**
- Create: `app/api/articles/[id]/route.ts`

- [ ] **Step 2.1: 라우트 작성**

```ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  instagram_url?: string | null;
  category?: string | null;
  notes?: string | null;
  // 발행 수동 토글
  set_published?: boolean;
  published_url?: string | null;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("articles").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if ("instagram_url" in body) update.instagram_url = body.instagram_url ?? null;
  if ("category" in body) update.category = body.category ?? null;
  if ("notes" in body) update.notes = body.notes ?? "";

  if ("set_published" in body) {
    if (body.set_published) {
      update.published_at = new Date().toISOString();
      update.published_source = "manual";
      if (body.published_url !== undefined) update.published_url = body.published_url;
    } else {
      update.published_at = null;
      update.published_url = null;
      update.published_source = null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb.from("articles").update(update).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2.2: 빌드 + 수동 호출 검증**

```bash
npm run build 2>&1 | tail -5
```
Expected: 빌드 성공.

dev 서버를 한 번 띄워(`npm run dev`) 브라우저에서 로그인 후, 콘솔에서:
```js
fetch('/api/articles/<some-id>', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ notes: '테스트 노트' })
}).then(r => r.json()).then(console.log);
```
Expected: 업데이트된 article row 반환.

(실제로는 다음 task에서 UI 작업 후 한꺼번에 검증해도 OK.)

- [ ] **Step 2.3: 커밋**

```bash
git add app/api/articles/[id]/route.ts
git commit -m "feat(api): PATCH /api/articles/[id] (메타 + 발행 수동 토글)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `lib/articles.ts` — flatList 헬퍼 추가

모달 안에서 이전/다음 순회용. **현재 컬럼·현재 섹션** 내에서만 순회. flatList는 `[agency, section, articleId]` 정보를 들고 있어야 한다.

**Files:**
- Modify: `lib/articles.ts`
- Modify: `tests/articles.test.ts`

- [ ] **Step 3.1: 실패 테스트**

`tests/articles.test.ts` 끝에 추가:
```ts
import { findNeighbor, type KanbanGroups, type ArticleRow } from '@/lib/articles';

describe('findNeighbor (모달 순회)', () => {
  function mkGroups(): KanbanGroups {
    const mk = (id: string, agency: AgencySlug, sec: 'pool' | 'today' | 'recent', extra: Partial<ArticleRow> = {}): ArticleRow => ({
      id, publish_date: '2026-05-21', agency, slug: id, person_name: id,
      title: id, source_path: null, instagram_url: null, category: null, notes: null,
      created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z',
      published_at: sec === 'pool' ? null : '2026-05-22T00:00:00Z',
      published_url: null, published_source: null,
      ...extra,
    });
    return {
      mih_speaker: {
        pool: [mk('s1', 'mih_speaker', 'pool'), mk('s2', 'mih_speaker', 'pool'), mk('s3', 'mih_speaker', 'pool')],
        today: [mk('s-t1', 'mih_speaker', 'today')],
        recent: [mk('s-r1', 'mih_speaker', 'recent')],
      },
      mih_casting: { pool: [mk('c1', 'mih_casting', 'pool')], today: [], recent: [] },
      mih_agency: { pool: [], today: [], recent: [] },
    };
  }

  it('returns the next id within the same agency+section', () => {
    const groups = mkGroups();
    expect(findNeighbor(groups, 's1', 'next')).toBe('s2');
    expect(findNeighbor(groups, 's2', 'next')).toBe('s3');
  });

  it('returns the prev id within the same agency+section', () => {
    const groups = mkGroups();
    expect(findNeighbor(groups, 's3', 'prev')).toBe('s2');
  });

  it('returns null when at the boundary (does not cross sections)', () => {
    const groups = mkGroups();
    expect(findNeighbor(groups, 's3', 'next')).toBe(null);
    expect(findNeighbor(groups, 's1', 'prev')).toBe(null);
  });

  it('returns null when id not found', () => {
    const groups = mkGroups();
    expect(findNeighbor(groups, 'nonexistent', 'next')).toBe(null);
  });

  it('also handles today and recent sections', () => {
    const groups = mkGroups();
    // today 섹션 single item — neighbor 없음
    expect(findNeighbor(groups, 's-t1', 'next')).toBe(null);
    expect(findNeighbor(groups, 's-t1', 'prev')).toBe(null);
  });
});
```

위 코드의 `AgencySlug` import는 파일 상단에 추가해야 함.

- [ ] **Step 3.2: 실패 확인**

```bash
npm test -- tests/articles.test.ts
```
Expected: 5개 새 테스트 실패 (`findNeighbor is not a function`).

- [ ] **Step 3.3: 구현**

`lib/articles.ts`에 추가:
```ts
const SECTIONS: ('pool' | 'today' | 'recent')[] = ['pool', 'today', 'recent'];

export function findNeighbor(
  groups: KanbanGroups,
  currentId: string,
  direction: 'prev' | 'next'
): string | null {
  for (const slug of Object.keys(groups) as AgencySlug[]) {
    for (const sec of SECTIONS) {
      const list = groups[slug][sec];
      const idx = list.findIndex((a) => a.id === currentId);
      if (idx === -1) continue;
      const nextIdx = direction === 'next' ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= list.length) return null;
      return list[nextIdx].id;
    }
  }
  return null;
}
```

- [ ] **Step 3.4: 통과 확인**

```bash
npm test
```
Expected: 모든 테스트 통과 (이전 + 신규 5).

- [ ] **Step 3.5: 커밋**

```bash
git add lib/articles.ts tests/articles.test.ts
git commit -m "feat(articles): findNeighbor 헬퍼 (같은 컬럼·섹션 내 순회)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `ArticleModalPreview.tsx`

우측 미리보기 영역. 본문 lazy fetch + 명함 합성 + iframe. 본문이 비어 있는 경우(404) 에러 메시지.

**Files:**
- Create: `app/dashboard-v2/_components/ArticleModalPreview.tsx`

- [ ] **Step 4.1: 파일 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { AgencySlug } from "@/lib/agencies";
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";

type Props = { articleId: string; agency: AgencySlug };

export default function ArticleModalPreview({ articleId, agency }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    fetch(`/api/manuscripts/${articleId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const raw = typeof data?.html_content === "string" ? data.html_content : "";
        const card = buildBusinessCardHtml(agency);
        setHtml(mergeWithBusinessCard(raw, card));
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId, agency]);

  if (error) {
    return <div className="p-6 text-red-700 text-sm">미리보기 로드 실패: {error}</div>;
  }
  if (html == null) {
    return <div className="p-6 text-gray-400 text-sm">불러오는 중…</div>;
  }

  const srcDoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
body { margin:0; padding:24px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",Arial,sans-serif; color:#222; background:#fff; line-height:1.6; }
img { max-width:100%; height:auto; }
hr { border:none; border-top:1px solid #e0e0e0; margin:20px 0; }
</style></head><body>${html}</body></html>`;

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      className="w-full h-full bg-white"
      style={{ border: 0 }}
    />
  );
}
```

(커밋은 Task 6 끝에 모달 컴포넌트 묶음으로.)

---

## Task 5: `ArticleModalMeta.tsx`

좌측 메타 패널. instagram_url · category · notes 편집 + 발행 상태 토글.

**Files:**
- Create: `app/dashboard-v2/_components/ArticleModalMeta.tsx`

- [ ] **Step 5.1: 파일 작성**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { ArticleRow } from "@/lib/articles";

type Props = {
  article: ArticleRow;
  onUpdated: (next: ArticleRow) => void;
};

export default function ArticleModalMeta({ article, onUpdated }: Props) {
  const [instagram, setInstagram] = useState(article.instagram_url ?? "");
  const [category, setCategory] = useState(article.category ?? "");
  const [notes, setNotes] = useState(article.notes ?? "");
  const [publishedUrl, setPublishedUrl] = useState(article.published_url ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setInstagram(article.instagram_url ?? "");
    setCategory(article.category ?? "");
    setNotes(article.notes ?? "");
    setPublishedUrl(article.published_url ?? "");
  }, [article.id, article.instagram_url, article.category, article.notes, article.published_url]);

  const dirty =
    (article.instagram_url ?? "") !== instagram ||
    (article.category ?? "") !== category ||
    (article.notes ?? "") !== notes;

  function saveMeta() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/articles/${article.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instagram_url: instagram || null,
            category: category || null,
            notes,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = (await res.json()) as ArticleRow;
        onUpdated(next);
        toast.success("메타 저장됨");
      } catch (e) {
        toast.error("저장 실패: " + (e as Error).message);
      }
    });
  }

  function togglePublished(on: boolean) {
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = { set_published: on };
        if (on && publishedUrl) body.published_url = publishedUrl;
        const res = await fetch(`/api/articles/${article.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = (await res.json()) as ArticleRow;
        onUpdated(next);
        toast.success(on ? "발행됨 표시" : "미발행으로 되돌림");
      } catch (e) {
        toast.error("발행 상태 변경 실패: " + (e as Error).message);
      }
    });
  }

  const isPublished = article.published_at !== null;

  return (
    <div className="space-y-4 p-4 overflow-y-auto text-xs">
      <section>
        <Label className="text-[10px] uppercase tracking-wide text-gray-500">발행 정보</Label>
        <div className="text-xs mt-1">{article.agency} · {article.publish_date}</div>
        <div className="text-[10px] text-gray-400 font-mono">slug: {article.slug}</div>
      </section>

      <section className="space-y-2">
        <Label className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center gap-2">
          발행 상태
          {article.published_source === "rss" && <span className="text-[9px] text-green-700">RSS 자동</span>}
          {article.published_source === "manual" && <span className="text-[9px] text-orange-700">수동</span>}
        </Label>
        <div className="flex items-center gap-2">
          <Switch checked={isPublished} disabled={pending} onCheckedChange={togglePublished} />
          <span className="text-xs">{isPublished ? "발행됨" : "미발행"}</span>
        </div>
        {isPublished && (
          <Input
            value={publishedUrl}
            onChange={(e) => setPublishedUrl(e.target.value)}
            placeholder="발행 URL (선택)"
            className="text-xs"
          />
        )}
      </section>

      <section className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-gray-500">인스타그램 URL</Label>
        <Input
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          placeholder="https://www.instagram.com/..."
          className={`text-xs ${(article.instagram_url ?? "") !== instagram ? "border-blue-500 bg-blue-50/30" : ""}`}
        />
      </section>

      <section className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-gray-500">카테고리</Label>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="인물 · 강연 등"
          className={`text-xs ${(article.category ?? "") !== category ? "border-blue-500 bg-blue-50/30" : ""}`}
        />
      </section>

      <section className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-gray-500">노트</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className={`text-xs ${(article.notes ?? "") !== notes ? "border-blue-500 bg-blue-50/30" : ""}`}
        />
      </section>

      <Button onClick={saveMeta} disabled={!dirty || pending} className="w-full" size="sm">
        {pending ? "저장 중…" : dirty ? "저장" : "변경 없음"}
      </Button>
    </div>
  );
}
```

---

## Task 6: `ArticleModal.tsx` — Dialog 루트

상단 헤더(제목·메타·액션) + 좌측 메타 + 우측 미리보기 + 키보드/순회.

**Files:**
- Create: `app/dashboard-v2/_components/ArticleModal.tsx`

- [ ] **Step 6.1: 파일 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AGENCIES } from "@/lib/agencies";
import type { ArticleRow } from "@/lib/articles";
import { copyPlain, copyRichHtml } from "@/lib/clipboard";
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";
import ArticleModalMeta from "./ArticleModalMeta";
import ArticleModalPreview from "./ArticleModalPreview";

type Props = {
  articleId: string | null;
  onClose: () => void;
  onNeighbor: (direction: "prev" | "next") => void;
  positionLabel?: string;
};

export default function ArticleModal({ articleId, onClose, onNeighbor, positionLabel }: Props) {
  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"title" | "body" | null>(null);

  useEffect(() => {
    if (!articleId) {
      setArticle(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/articles/${articleId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setArticle(data as ArticleRow);
      })
      .catch(() => {
        if (!cancelled) setArticle(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  useEffect(() => {
    if (!articleId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") onNeighbor("prev");
      if (e.key === "ArrowRight") onNeighbor("next");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [articleId, onNeighbor]);

  async function onCopyTitle() {
    if (!article) return;
    setBusy("title");
    try {
      await copyPlain(article.title);
      toast.success("제목 복사");
    } finally {
      setBusy(null);
    }
  }

  async function onCopyBody() {
    if (!article) return;
    setBusy("body");
    try {
      const res = await fetch(`/api/manuscripts/${article.id}`, { cache: "no-store" });
      const data = await res.json();
      const raw = typeof data?.html_content === "string" ? data.html_content : "";
      const merged = mergeWithBusinessCard(raw, buildBusinessCardHtml(article.agency));
      await copyRichHtml(merged);
      toast.success("원고 복사 — Ctrl+V");
    } catch (e) {
      toast.error("복사 실패: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={articleId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[90vw] w-[1200px] h-[85vh] p-0 overflow-hidden flex flex-col gap-0">
        {loading || !article ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">불러오는 중…</div>
        ) : (
          <>
            <header className="flex items-start gap-3 px-4 py-3 border-b">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-400 mb-0.5">
                  {AGENCIES[article.agency].blogSlug} · {article.publish_date}
                  {positionLabel && <> · {positionLabel}</>}
                </div>
                <h2 className="text-sm font-bold truncate">{article.title}</h2>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button onClick={onCopyTitle} disabled={busy !== null} size="sm" variant="outline">📋 제목</Button>
                <Button onClick={onCopyBody} disabled={busy !== null} size="sm">📰 본문</Button>
                <Link href={`/article/${article.id}`} target="_blank" rel="noopener">
                  <Button size="sm" variant="outline">↗ 열기</Button>
                </Link>
                <Button onClick={onClose} size="sm" variant="ghost">✕</Button>
              </div>
            </header>
            <div className="flex-1 grid grid-cols-[280px_1fr] overflow-hidden">
              <aside className="border-r overflow-y-auto bg-gray-50/50">
                <ArticleModalMeta article={article} onUpdated={(next) => setArticle(next)} />
              </aside>
              <main className="overflow-hidden">
                <ArticleModalPreview articleId={article.id} agency={article.agency} />
              </main>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6.2: 빌드 통과 확인**

```bash
npm run build 2>&1 | tail -5
```
Expected: 빌드 성공. `DashboardClient` 가 아직 ArticleModal을 사용하지 않으니 import만 추가되지 않은 상태에서도 unused import 없으면 통과.

- [ ] **Step 6.3: 모달 3개 + 메타 + 미리보기 묶음 커밋**

```bash
git add app/dashboard-v2/_components/ArticleModal.tsx app/dashboard-v2/_components/ArticleModalMeta.tsx app/dashboard-v2/_components/ArticleModalPreview.tsx
git commit -m "feat(dashboard-v2): 카드 모달 컴포넌트 (메타 패널 + 미리보기 + 키보드 순회)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: DashboardClient 연결 + URL 쿼리 동기화

`?article=<id>` 로 모달 상태를 URL에 반영. 새로고침/뒤로가기 복원 가능.

**Files:**
- Modify: `app/dashboard-v2/_components/DashboardClient.tsx`
- Modify: `app/dashboard-v2/_components/ArticleCard.tsx`

- [ ] **Step 7.1: DashboardClient 수정**

다음 변화를 적용:
1. `useRouter`, `useSearchParams` 사용
2. 모달 articleId 상태 = `searchParams.get('article')`
3. 카드에서 onClick 받아 router.push로 쿼리 변경
4. 모달 close → 쿼리 제거
5. 이전/다음 → findNeighbor 호출 후 router.replace

전체 새 버전:

```tsx
"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { KanbanGroups, KanbanKpis, ArticleRow } from "@/lib/articles";
import { findNeighbor } from "@/lib/articles";
import TopBar from "./TopBar";
import KpiStrip from "./KpiStrip";
import FilterBar, { type FilterChip } from "./FilterBar";
import KanbanBoard from "./KanbanBoard";
import ArticleModal from "./ArticleModal";

type Props = {
  groups: KanbanGroups;
  kpis: KanbanKpis;
  generatedAt: string;
};

const KST_OFFSET_MS = 9 * 3600_000;
function isToday(iso: string): boolean {
  const t = Date.parse(iso);
  const midnight = Math.floor((Date.now() + KST_OFFSET_MS) / 86400_000) * 86400_000 - KST_OFFSET_MS;
  return t >= midnight;
}

export default function DashboardClient({ groups, kpis, generatedAt }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("article");

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

  const openModal = useCallback((id: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("article", id);
    router.push(`?${sp.toString()}`, { scroll: false });
  }, [params, router]);

  const closeModal = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("article");
    router.push(sp.size > 0 ? `?${sp.toString()}` : "/dashboard-v2", { scroll: false });
  }, [params, router]);

  const navigate = useCallback((direction: "prev" | "next") => {
    if (!openId) return;
    const next = findNeighbor(filteredGroups, openId, direction);
    if (next) openModal(next);
  }, [openId, filteredGroups, openModal]);

  return (
    <div className="min-h-screen bg-[color:var(--color-muted)] text-[color:var(--color-text)]">
      <TopBar generatedAt={generatedAt} />
      <KpiStrip kpis={kpis} />
      <FilterBar search={search} onSearch={setSearch} chip={chip} onChip={setChip} />
      <KanbanBoard groups={filteredGroups} onOpen={openModal} />
      <ArticleModal articleId={openId} onClose={closeModal} onNeighbor={navigate} />
    </div>
  );
}
```

- [ ] **Step 7.2: KanbanBoard / KanbanColumn / ArticleCard 의 props 흐름 갱신**

`onOpen: (id: string) => void` 를 board → column → card 로 전달.

**KanbanBoard.tsx**:
```tsx
import type { KanbanGroups } from "@/lib/articles";
import { AGENCIES, AGENCY_SLUGS } from "@/lib/agencies";
import KanbanColumn from "./KanbanColumn";

type Props = { groups: KanbanGroups; onOpen: (id: string) => void };

export default function KanbanBoard({ groups, onOpen }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 p-4">
      {AGENCY_SLUGS.map((slug) => (
        <KanbanColumn key={slug} agency={slug} agencyInfo={AGENCIES[slug]} group={groups[slug]} onOpen={onOpen} />
      ))}
    </div>
  );
}
```

**KanbanColumn.tsx**: prop으로 `onOpen` 받아서 `<ArticleCard ... onOpen={onOpen} />`로 패스.

각 ArticleCard 호출 부분(3곳: 발행 대기 / 오늘 발행 / 최근 발행) 모두 `onOpen={onOpen}` 추가.

- [ ] **Step 7.3: ArticleCard 수정 — Link 대신 onClick**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ArticleRow } from "@/lib/articles";
import { copyPlain, copyRichHtml } from "@/lib/clipboard";
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";

type Variant = "pool" | "published" | "recent";
type Props = { article: ArticleRow; variant: Variant; onOpen: (id: string) => void };

function kstTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
}

async function fetchHtml(id: string): Promise<string> {
  const res = await fetch(`/api/manuscripts/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data?.html_content !== "string") throw new Error("html_content 없음");
  return data.html_content;
}

export default function ArticleCard({ article, variant, onOpen }: Props) {
  const [busy, setBusy] = useState<"title" | "body" | null>(null);
  const opacityCls = variant === "recent" ? "opacity-70" : variant === "published" ? "opacity-90 bg-gray-50" : "";
  const missingInsta = article.instagram_url == null;

  async function onCopyTitle(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy("title");
    try {
      await copyPlain(article.title);
      toast.success(`제목 복사: ${article.person_name}`);
    } catch (err) {
      toast.error("제목 복사 실패: " + (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onCopyBody(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy("body");
    try {
      const raw = await fetchHtml(article.id);
      const merged = mergeWithBusinessCard(raw, buildBusinessCardHtml(article.agency));
      await copyRichHtml(merged);
      toast.success(`원고 복사: ${article.person_name}`);
    } catch (err) {
      toast.error("원고 복사 실패: " + (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(article.id)}
      className={`group relative block w-full text-left border border-[color:var(--color-border)] rounded mb-1 px-2 py-1.5 hover:border-[color:var(--color-primary)] hover:shadow-sm transition ${opacityCls}`}
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
      <div className="flex items-center justify-between mt-0.5">
        <div className="text-[9px] text-[color:var(--color-text-muted)]">
          {variant === "pool" && `${article.created_at.slice(0, 10)} 추가`}
          {variant === "published" && `${article.agency} RSS 매칭`}
          {variant === "recent" && article.published_at && `${article.published_at.slice(0, 10)} 발행`}
        </div>
        <div className="flex gap-1">
          <span
            onClick={onCopyTitle}
            role="button"
            tabIndex={0}
            aria-disabled={busy !== null}
            className="text-[9px] px-1.5 py-0.5 rounded border border-[color:var(--color-border)] bg-white text-gray-700 hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)] cursor-pointer"
          >
            {busy === "title" ? "…" : "📋 제목"}
          </span>
          <span
            onClick={onCopyBody}
            role="button"
            tabIndex={0}
            aria-disabled={busy !== null}
            className="text-[9px] px-1.5 py-0.5 rounded border border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-white cursor-pointer"
          >
            {busy === "body" ? "…" : "📰 본문"}
          </span>
        </div>
      </div>
    </button>
  );
}
```

**중요:** `<button>` 안에 또 `<button>`을 넣으면 HTML invalid. 그래서 카드 내부의 두 복사 버튼은 `<span role="button">`으로 변경 + onClick에 `stopPropagation`. 단점: 키보드 접근성이 약하지만 운영 도구라 OK.

- [ ] **Step 7.4: 빌드 + 시각 검증**

```bash
npm run build 2>&1 | tail -5
```

dev 서버에서 확인:
- 카드 클릭 → 중앙 모달 오픈, URL이 `?article=<id>`로 바뀜
- 카드의 📋 📰 → 즉시 복사 (모달 안 열림)
- 모달 안 좌우 화살표 → 같은 컬럼·섹션 내 이동
- ESC 또는 외부 클릭 → 닫기
- 새로고침 → 모달 상태 복원

- [ ] **Step 7.5: 커밋**

```bash
git add app/dashboard-v2/_components/
git commit -m "feat(dashboard-v2): 모달 통합 (카드 클릭 → 모달, URL 쿼리 동기화, 키보드 순회)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 회귀 검증 + PR

- [ ] **Step 8.1: 기존 경로 회귀**

| 경로 | 기대 |
|---|---|
| `/` | 기존 HomeView 그대로 |
| `/keywords`, `/rss`, `/login` | 그대로 |
| `/article/[id]` | 풀페이지 그대로 (모달의 ↗ 열기 대상) |
| `/dashboard-v2` | 모달이 카드 클릭 시 작동 |

- [ ] **Step 8.2: 메타 편집 통합 검증**

dev 환경에서 직접 모달 안에서:
- 인스타그램 URL 입력 → 저장 → toast → DB 반영 확인
- 발행됨 토글 ON/OFF → 카드에 상태 즉시 반영
- 노트 / 카테고리 수정 → 검색 chip "인스타URL 미등록"이 해당 카드에서 사라지는지

- [ ] **Step 8.3: push + PR**

```bash
git push -u origin feat/dashboard-redesign-phase3-modal
gh pr create --base feat/dashboard-redesign-phase2-ui --head feat/dashboard-redesign-phase3-modal --title "Phase 3: 카드 모달 + 메타 편집" --body "..."
```

PR body 템플릿:
```
## 요약

대시보드 UI 개편의 Phase 3 — 카드 클릭 동선을 중앙 모달로 변경. 모달 안에서 미리보기·복사·메타 편집·발행됨 수동 토글이 한 화면에서 끝남. 풀페이지는 ↗ 열기·URL 공유용으로 유지.

상세 설계: `docs/superpowers/specs/2026-05-22-dashboard-redesign-design.md`
구현 계획: `docs/superpowers/plans/2026-05-22-dashboard-redesign-phase3-modal-and-meta.md`

## 변경 사항

- shadcn `dialog`/`switch`/`textarea`/`label` 추가
- `/api/articles/[id]` PATCH 라우트 (메타 + 발행 수동 토글)
- `ArticleModal` / `ArticleModalMeta` / `ArticleModalPreview` 컴포넌트
- DashboardClient에 모달 상태 + URL 쿼리 동기화 (`?article=<id>`)
- 화살표 키 순회 (현재 컬럼·섹션 내)
- `findNeighbor` 헬퍼 + 테스트
- ArticleCard: `<Link>` → `<button>` + onClick으로 모달 오픈, 내부 복사 버튼은 `<span role="button">`로 변경 (button 중첩 회피)

## 무변경

- `/`, `/keywords`, `/rss`, `/login`, `/article/[id]`

## Test Plan

- [x] `npm test`
- [x] `npm run build`
- [ ] 카드 클릭 → 모달 오픈, URL 쿼리 반영 (수동)
- [ ] 좌우 화살표 / ESC 동작 (수동)
- [ ] 메타 편집 → DB 반영 (수동)
- [ ] 발행됨 수동 토글 → 카드 상태 즉시 반영 (수동)
- [ ] 카드의 인라인 📋 📰 클릭 시 모달 열리지 않음 (수동)
```

---

## 완료 기준 (DoD)

- [ ] 카드 클릭 시 중앙 모달이 열림
- [ ] URL이 `?article=<id>` 로 동기화, 새로고침/뒤로가기 복원
- [ ] 화살표 키로 같은 컬럼·섹션 안에서 이전/다음 이동
- [ ] ESC 또는 외부 클릭 → 닫기
- [ ] 메타 편집(인스타·카테고리·노트) → PATCH → toast
- [ ] 발행됨 수동 토글 → `published_source = 'manual'` + UI 즉시 반영
- [ ] 카드 내부 📋 📰 버튼은 모달을 열지 않고 즉시 복사
- [ ] 풀페이지(`/article/[id]`) 무변경 동작
- [ ] `findNeighbor` 단위 테스트 통과
- [ ] PR 생성

---

## 스코프 밖

- 모달 안의 인접 카드 prefetch (성능 최적화) — 나중에
- 키워드 자동 완성 / 카테고리 표준화 — 사용자가 자유 텍스트 입력 유지
- 모달 안에서 본문 직접 편집 — Phase 2~3 범위 밖, 별도 검토 필요 시
- /rss 신규 페이지 — Plan 4
- `/dashboard-v2` → `/` 스위치 오버 — Plan 5
- `keywords` 테이블 drop — Plan 5

---

## 스펙과의 매핑

| 스펙 섹션 | 이 plan의 task |
|---|---|
| 7.1 카드 → 모달, URL 동기화 | Task 6, 7 |
| 7.2 제목 복사 + 단축키 | Task 6 |
| 7.3 메타 편집 + dirty 표시 | Task 5 |
| 7.4 발행됨 수동 토글 | Task 5 |
| 7.7 단축키 ESC, ←/→ | Task 6 |
| 4.4 발행됨 수동 토글 (DB 반영) | Task 2 |
| 6 컴포넌트 트리 (ArticleModal*) | Task 4, 5, 6 |
| 10 모달 dirty confirm | (스코프 밖 — 단순 경고로 충분) |
