# 노출 KPI 기록 (SERP Logging) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `"<인물명> 섭외"` 검색 결과의 색인 여부·순위·경쟁 문서를 발행 원고별로 DB에 상시 기록한다. 미노출도 반드시 남긴다.

**Architecture:** 기존 `lib/naver-search/*` 모듈을 확장한다. 순수 파서(`exposure.ts`)에 순위·경쟁 문서 추출을 더하고, 새 테이블 `mih_serp_checks` 에 기록하는 얇은 레이어(`serp-log.ts`)와 체크 대상 선정(`schedule.ts`)을 추가한 뒤, 일일 잡(`index.ts`)의 구동원을 RSS 에서 `articles` 테이블로 바꾼다. Discord 발송 동작은 그대로 유지한다.

**Tech Stack:** Next.js App Router (route handler), TypeScript, Supabase (`@supabase/supabase-js`, Management API 마이그레이션), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-15-knowledge-graph-agent-chain-design.md` (§4 A — 노출 KPI 기록)

## Global Constraints

- **미노출도 반드시 1행 기록한다** (`indexed=false, rank=null`). 조용한 skip 금지 — 현재 구조의 가장 큰 결함이다.
- `indexed`(색인 여부)와 `rank`(순위)를 **분리해서** 기록한다. 원인 진단이 갈린다.
- 체크 시점은 발행 후 **D+1, D+3, D+7, D+14, D+30** 다섯 번. 매일 전량 재검색하지 않는다.
- 쿼리는 `"<인물명> 섭외"` 고정. 기존 `toSearchQuery()` 를 그대로 쓴다.
- **기존 Discord 발송 동작을 바꾸지 않는다** — 노출된 D+1 건에만 스크린샷을 보낸다. 사람이 매일 보는 화면을 건드리지 않는다.
- 파싱 실패를 조용히 삼키지 않는다 — `rank=null, note='parse-failed'` 로 남긴다.
- 함수 실행 상한은 `maxDuration = 300` 초다. 검색은 동시 3개까지 병렬로 처리한다.
- 우리 블로그 슬러그는 `mih_speaker`, `mih_casting`, `mih_agency`, `kyh620303` 네 개다 (`MIH_BLOG_SLUGS`).
- 테스트는 `npm test` (vitest run). 테스트 파일은 `tests/` 아래, `@/` 별칭으로 소스를 import 한다.
- 마이그레이션은 `supabase/migrations/` 에 SQL 을 두고 `node scripts/apply-migration.mjs <path>` 로 적용한다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/naver-search/exposure.ts` (수정) | 순수 파서. HTML → 블로그 결과 목록 → 우리 순위 + 경쟁 문서. 네트워크·DB 없음 |
| `lib/naver-search/schedule.ts` (신규) | 오늘 체크할 대상(article + query) 선정. D+N 오프셋 계산 + 쿼리별 그룹핑 |
| `lib/naver-search/serp-log.ts` (신규) | `mih_serp_checks` 기록. Supabase 접근만 |
| `lib/naver-search/index.ts` (수정) | 잡 오케스트레이션. 위 셋을 엮고 Discord 발송 |
| `supabase/migrations/20260815000000_create_mih_serp_checks.sql` (신규) | 테이블 DDL |
| `tests/naver-search/exposure.test.ts` (수정) | 파서 테스트 |
| `tests/naver-search/schedule.test.ts` (신규) | 대상 선정 테스트 |

---

### Task 1: SERP 파서 — 순위와 경쟁 문서 추출

`isMihExposed()` 는 불리언만 준다. 순위를 세려면 결과 순서가 필요하다. 네이버 통합검색의 DOM 구조는 자주 바뀌므로 **DOM 구조에 의존하지 않는다** — HTML 등장 순서대로 블로그 포스트 링크를 뽑아 중복 제거하고, 그 목록에서 우리 블로그의 위치를 센다. 이것은 정확한 네이버 SERP 순위가 아니라 **일관된 자**이며, 추세 비교가 목적이므로 충분하다.

**Files:**
- Modify: `lib/naver-search/exposure.ts`
- Test: `tests/naver-search/exposure.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `type SerpEntry = { rank: number; url: string; slug: string }`
  - `type SerpResult = { indexed: boolean; rank: number | null; entries: SerpEntry[]; competitors: SerpEntry[]; parseFailed: boolean }`
  - `parseSerp(html: string): SerpResult`
  - 기존 `isMihExposed`, `MIH_BLOG_SLUGS` 는 유지 (다른 테스트가 의존한다)

- [ ] **Step 1: Write the failing test**

`tests/naver-search/exposure.test.ts` 파일 끝에 append:

```typescript
import { parseSerp } from '@/lib/naver-search/exposure';

const html = (...urls: string[]) =>
  urls.map((u) => `<a href="${u}">t</a>`).join('\n');

describe('parseSerp', () => {
  it('ranks blog post links in HTML order and finds our slug', () => {
    const r = parseSerp(
      html(
        'https://blog.naver.com/other_a/111',
        'https://blog.naver.com/mih_casting/222',
        'https://blog.naver.com/other_b/333',
      ),
    );
    expect(r.indexed).toBe(true);
    expect(r.rank).toBe(2);
    expect(r.entries).toHaveLength(3);
    expect(r.parseFailed).toBe(false);
  });

  it('records indexed=false with rank null when we are absent', () => {
    const r = parseSerp(html('https://blog.naver.com/other_a/111'));
    expect(r.indexed).toBe(false);
    expect(r.rank).toBeNull();
    expect(r.parseFailed).toBe(false);
  });

  it('dedupes the same post URL appearing twice', () => {
    const r = parseSerp(
      html(
        'https://blog.naver.com/other_a/111',
        'https://blog.naver.com/other_a/111',
        'https://blog.naver.com/mih_agency/222',
      ),
    );
    expect(r.entries.map((e) => e.url)).toEqual([
      'https://blog.naver.com/other_a/111',
      'https://blog.naver.com/mih_agency/222',
    ]);
    expect(r.rank).toBe(2);
  });

  it('ignores non-post blog links such as PostList', () => {
    const r = parseSerp(
      html(
        'https://blog.naver.com/PostList.naver?blogId=x',
        'https://blog.naver.com/other_a/111',
      ),
    );
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].slug).toBe('other_a');
  });

  it('takes the best (lowest) rank when several of our blogs appear', () => {
    const r = parseSerp(
      html(
        'https://blog.naver.com/other_a/111',
        'https://blog.naver.com/mih_agency/222',
        'https://blog.naver.com/mih_casting/333',
      ),
    );
    expect(r.rank).toBe(2);
  });

  it('returns up to 5 competitors excluding our own blogs', () => {
    const r = parseSerp(
      html(
        'https://blog.naver.com/c1/1',
        'https://blog.naver.com/c2/2',
        'https://blog.naver.com/mih_speaker/3',
        'https://blog.naver.com/c3/4',
        'https://blog.naver.com/c4/5',
        'https://blog.naver.com/c5/6',
        'https://blog.naver.com/c6/7',
      ),
    );
    expect(r.competitors).toHaveLength(5);
    expect(r.competitors.map((c) => c.slug)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    expect(r.competitors[0].rank).toBe(1);
  });

  it('flags parseFailed when no blog post links are found at all', () => {
    const r = parseSerp('<html><body>no results</body></html>');
    expect(r.parseFailed).toBe(true);
    expect(r.indexed).toBe(false);
    expect(r.rank).toBeNull();
  });

  it('flags parseFailed on empty HTML', () => {
    expect(parseSerp('').parseFailed).toBe(true);
  });

  it('handles m.blog.naver.com and protocol-relative URLs', () => {
    const r = parseSerp(
      html('//m.blog.naver.com/mih_speaker/999'),
    );
    expect(r.indexed).toBe(true);
    expect(r.rank).toBe(1);
    expect(r.entries[0].url).toBe('https://blog.naver.com/mih_speaker/999');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/naver-search/exposure.test.ts`
Expected: FAIL — `parseSerp` is not exported / not a function

- [ ] **Step 3: Write minimal implementation**

`lib/naver-search/exposure.ts` 를 아래로 교체 (기존 export 유지):

```typescript
export const MIH_BLOG_SLUGS = ['mih_speaker', 'mih_casting', 'mih_agency', 'kyh620303'] as const;

export function isMihExposed(html: string): boolean {
  if (!html) return false;
  return MIH_BLOG_SLUGS.some((s) => html.includes(`blog.naver.com/${s}`));
}

export type SerpEntry = { rank: number; url: string; slug: string };

export type SerpResult = {
  indexed: boolean;
  rank: number | null;
  entries: SerpEntry[];
  competitors: SerpEntry[];
  parseFailed: boolean;
};

const COMPETITOR_LIMIT = 5;

/** blog.naver.com/<slug>/<postId> 형태만 잡는다. PostList.naver 등 목록 링크는 제외된다.
 *  m.blog.naver.com 과 프로토콜 상대 URL(//...)도 같은 정규 URL로 접는다. */
const POST_LINK = /(?:https?:)?\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d+)/g;

export function parseSerp(html: string): SerpResult {
  const entries: SerpEntry[] = [];
  const seen = new Set<string>();

  if (html) {
    for (const m of html.matchAll(POST_LINK)) {
      const slug = m[1];
      const url = `https://blog.naver.com/${slug}/${m[2]}`;
      if (seen.has(url)) continue;
      seen.add(url);
      entries.push({ rank: entries.length + 1, url, slug });
    }
  }

  const parseFailed = entries.length === 0;
  const ours = entries.filter((e) => (MIH_BLOG_SLUGS as readonly string[]).includes(e.slug));
  const competitors = entries
    .filter((e) => !(MIH_BLOG_SLUGS as readonly string[]).includes(e.slug))
    .slice(0, COMPETITOR_LIMIT);

  return {
    indexed: ours.length > 0,
    rank: ours.length > 0 ? ours[0].rank : null,
    entries,
    competitors,
    parseFailed,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/naver-search/exposure.test.ts`
Expected: PASS — 기존 `isMihExposed` 테스트 8개 + 새 `parseSerp` 테스트 9개

- [ ] **Step 5: Commit**

```bash
git add lib/naver-search/exposure.ts tests/naver-search/exposure.test.ts
git commit -m "feat(serp): parse blog result rank and competitors from naver SERP html"
```

---

### Task 2: `mih_serp_checks` 테이블

**Files:**
- Create: `supabase/migrations/20260815000000_create_mih_serp_checks.sql`

**Interfaces:**
- Consumes: 기존 `articles(id)` 테이블
- Produces: 테이블 `mih_serp_checks` — 컬럼 `id, article_id, query, checked_at, surface, indexed, rank, competitors, screenshot, note`

- [ ] **Step 1: Write the migration SQL**

`supabase/migrations/20260815000000_create_mih_serp_checks.sql`:

```sql
-- "<인물명> 섭외" 검색의 색인 여부·순위 기록.
--
-- indexed 와 rank 를 분리하는 이유: 색인 실패(계정 지수·발행 패턴 문제)와
-- 색인은 됐으나 밀린 것(원고 문제)은 원인이 다르다. 한 덩어리로 묶으면 진단이 불가능하다.
--
-- 미노출도 1행을 남긴다. 기존 스크린샷 크론은 미노출을 조용히 skip 해서
-- 정작 가장 봐야 할 실패 사례가 기록되지 않았다.

CREATE TABLE IF NOT EXISTS mih_serp_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid REFERENCES articles(id) ON DELETE CASCADE,
  query       text NOT NULL,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  -- 중복 방지 키. checked_at::date 를 쓰는 표현식 인덱스로 만들면 PostgREST 의
  -- on_conflict 가 그것을 가리킬 수 없고(컬럼 이름만 받는다), 생성 컬럼으로 만들면
  -- timestamptz→date 캐스트가 immutable 이 아니라 거부된다. 그래서 기본값을 가진
  -- 평범한 date 컬럼으로 둔다.
  checked_on  date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),
  surface     text NOT NULL DEFAULT 'pc-total',
  indexed     boolean NOT NULL,
  rank        smallint,
  competitors jsonb NOT NULL DEFAULT '[]',
  screenshot  text,
  note        text
);

CREATE INDEX IF NOT EXISTS mih_serp_checks_article_idx
  ON mih_serp_checks (article_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS mih_serp_checks_query_idx
  ON mih_serp_checks (query, checked_at DESC);

-- 같은 원고를 같은 날 두 번 기록하지 않는다(크론 재실행·수동 실행 중복 방지).
CREATE UNIQUE INDEX IF NOT EXISTS mih_serp_checks_daily_idx
  ON mih_serp_checks (article_id, surface, checked_on);
```

> `first_seen_at`(스펙 §4.1)은 별도 컬럼으로 두지 않는다. `indexed=true` 인 행 중
> 가장 이른 `checked_at` 이 곧 그 값이라, 컬럼을 두면 같은 사실이 두 곳에 저장되어 어긋난다.

- [ ] **Step 2: Apply the migration**

Run: `node scripts/apply-migration.mjs supabase/migrations/20260815000000_create_mih_serp_checks.sql`
Expected: 성공 출력. 에러 없이 종료.

- [ ] **Step 3: Verify the table exists**

임시 스크립트로 빈 조회를 한 번 돌려 테이블 존재를 확인한다.

```bash
cat > scripts/_tmp-verify.mjs <<'EOF'
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { error, count } = await s.from('mih_serp_checks').select('*', { count: 'exact', head: true });
console.log(error ? `FAIL: ${error.message}` : `OK: ${count} rows`);
EOF
node --env-file=.env.local scripts/_tmp-verify.mjs; rm -f scripts/_tmp-verify.mjs
```

Expected: `OK: 0 rows`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260815000000_create_mih_serp_checks.sql
git commit -m "feat(serp): add mih_serp_checks table for exposure KPI history"
```

---

### Task 3: 체크 대상 선정 (D+N 스케줄)

발행 후 1·3·7·14·30일에만 확인한다. 같은 인물이 여러 계정에서 발행됐으면 검색은 한 번만 하고 기록은 원고마다 남긴다 — 검색 호출을 원고 수만큼 늘리지 않기 위해서다.

**Files:**
- Create: `lib/naver-search/schedule.ts`
- Test: `tests/naver-search/schedule.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `toSearchQuery(baseKeyword: string): string` — **`index.ts` 에 있던 것을 이 파일로 옮긴다.** `index.ts` 가 `schedule.ts` 를 import 하므로, `schedule.ts` 가 다시 `index.ts` 를 import 하면 순환 참조가 된다. `index.ts` 는 이 파일에서 re-export 한다 (Task 5)
  - `const CHECK_OFFSETS: readonly number[]` = `[1, 3, 7, 14, 30]`
  - `type PublishedArticle = { id: string; person_name: string | null; title: string; publish_date: string }`
  - `type CheckGroup = { query: string; articleIds: string[] }`
  - `kstDateMinus(days: number, now?: Date): string`
  - `targetDates(now?: Date): string[]`
  - `groupByQuery(articles: PublishedArticle[]): CheckGroup[]`
  - `articleQuery(a: PublishedArticle): string | null`

- [ ] **Step 1: Write the failing test**

`tests/naver-search/schedule.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  CHECK_OFFSETS,
  kstDateMinus,
  targetDates,
  articleQuery,
  groupByQuery,
  toSearchQuery,
  type PublishedArticle,
} from '@/lib/naver-search/schedule';

// 2026-08-15 09:00 KST == 2026-08-15T00:00:00Z
const NOW = new Date('2026-08-15T00:00:00Z');

const art = (over: Partial<PublishedArticle> = {}): PublishedArticle => ({
  id: 'a1',
  person_name: '아이유',
  title: '[아이유 섭외] 어쩌고',
  publish_date: '2026-08-14',
  ...over,
});

describe('CHECK_OFFSETS', () => {
  it('is D+1, 3, 7, 14, 30', () => {
    expect(CHECK_OFFSETS).toEqual([1, 3, 7, 14, 30]);
  });
});

describe('toSearchQuery', () => {
  it('appends 섭외', () => {
    expect(toSearchQuery('아이유')).toBe('아이유 섭외');
  });

  it('does not append when already suffixed', () => {
    expect(toSearchQuery('아이유 섭외')).toBe('아이유 섭외');
  });

  it('trims surrounding whitespace', () => {
    expect(toSearchQuery('  박효신 ')).toBe('박효신 섭외');
  });
});

describe('kstDateMinus', () => {
  it('subtracts days in KST', () => {
    expect(kstDateMinus(1, NOW)).toBe('2026-08-14');
    expect(kstDateMinus(30, NOW)).toBe('2026-07-16');
  });
});

describe('targetDates', () => {
  it('returns one date per offset', () => {
    expect(targetDates(NOW)).toEqual([
      '2026-08-14',
      '2026-08-12',
      '2026-08-08',
      '2026-08-01',
      '2026-07-16',
    ]);
  });
});

describe('articleQuery', () => {
  it('builds "<person> 섭외" from person_name', () => {
    expect(articleQuery(art())).toBe('아이유 섭외');
  });

  it('does not double the 섭외 suffix', () => {
    expect(articleQuery(art({ person_name: '아이유 섭외' }))).toBe('아이유 섭외');
  });

  it('falls back to the bracket keyword in the title when person_name is empty', () => {
    expect(articleQuery(art({ person_name: null, title: '[박효신 섭외] 무대' }))).toBe('박효신 섭외');
  });

  it('returns null when neither person_name nor a bracket keyword exists', () => {
    expect(articleQuery(art({ person_name: null, title: '제목만 있음' }))).toBeNull();
  });
});

describe('groupByQuery', () => {
  it('groups articles sharing one query so we search once', () => {
    const groups = groupByQuery([
      art({ id: 'a1', person_name: '아이유' }),
      art({ id: 'a2', person_name: '아이유' }),
      art({ id: 'a3', person_name: '박효신' }),
    ]);
    expect(groups).toEqual([
      { query: '아이유 섭외', articleIds: ['a1', 'a2'] },
      { query: '박효신 섭외', articleIds: ['a3'] },
    ]);
  });

  it('drops articles with no derivable query', () => {
    const groups = groupByQuery([art({ id: 'a1', person_name: null, title: '제목만' })]);
    expect(groups).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/naver-search/schedule.test.ts`
Expected: FAIL — Cannot find module `@/lib/naver-search/schedule`

- [ ] **Step 3: Write minimal implementation**

`lib/naver-search/schedule.ts`:

```typescript
/** `"<인물명> 섭외"` 로 만든다. 이미 `섭외` 로 끝나면 덧붙이지 않는다.
 *  index.ts 에 있던 것을 옮겨왔다 — index.ts 가 이 파일을 import 하므로 반대 방향은 순환이다. */
export function toSearchQuery(baseKeyword: string): string {
  const trimmed = baseKeyword.trim();
  return /섭외$/.test(trimmed) ? trimmed : `${trimmed} 섭외`;
}

/** 발행 후 이 날짜들에만 확인한다. 매일 전량 재검색하면 비용이 발행 누적에 비례해 는다. */
export const CHECK_OFFSETS = [1, 3, 7, 14, 30] as const;

export type PublishedArticle = {
  id: string;
  person_name: string | null;
  title: string;
  publish_date: string;
};

export type CheckGroup = { query: string; articleIds: string[] };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function kstDateMinus(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS - days * DAY_MS).toISOString().slice(0, 10);
}

export function targetDates(now: Date = new Date()): string[] {
  return CHECK_OFFSETS.map((d) => kstDateMinus(d, now));
}

/** 제목 앞머리의 `[키워드]` 를 뽑는다. person_name 이 비어 있는 옛 행을 위한 폴백이다. */
function bracketKeyword(title: string): string | null {
  return title.match(/^\s*\[([^\]]+)\]/)?.[1]?.trim() || null;
}

export function articleQuery(a: PublishedArticle): string | null {
  const base = a.person_name?.trim() || bracketKeyword(a.title);
  return base ? toSearchQuery(base) : null;
}

/** 같은 인물이 여러 계정에서 발행됐으면 검색은 한 번, 기록은 원고마다. */
export function groupByQuery(articles: PublishedArticle[]): CheckGroup[] {
  const byQuery = new Map<string, string[]>();
  for (const a of articles) {
    const q = articleQuery(a);
    if (!q) continue;
    const list = byQuery.get(q);
    if (list) list.push(a.id);
    else byQuery.set(q, [a.id]);
  }
  return [...byQuery].map(([query, articleIds]) => ({ query, articleIds }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/naver-search/schedule.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add lib/naver-search/schedule.ts tests/naver-search/schedule.test.ts
git commit -m "feat(serp): select D+1/3/7/14/30 check targets grouped by query"
```

---

### Task 4: 기록 레이어 (`serp-log.ts`)

**Files:**
- Create: `lib/naver-search/serp-log.ts`

**Interfaces:**
- Consumes: `supabaseAdmin()` (`@/lib/supabase`), `SerpEntry` / `SerpResult` (`./exposure`), `PublishedArticle` (`./schedule`)
- Produces:
  - `fetchArticlesPublishedOn(dates: string[]): Promise<PublishedArticle[]>`
  - `recordSerpChecks(args: { articleIds: string[]; query: string; result: SerpResult; screenshot?: string | null }): Promise<void>`

DB 접근만 담당한다. 파싱도 HTTP 도 하지 않는다. 이 파일은 단위 테스트를 두지 않는다 — 순수 로직이 없고 Supabase 클라이언트를 감싸는 얇은 층이라, 모킹 테스트는 구현을 그대로 베낀 것이 되어 아무것도 보증하지 못한다. 검증은 Task 6의 실제 실행으로 한다.

- [ ] **Step 1: Write the implementation**

`lib/naver-search/serp-log.ts`:

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import type { SerpResult } from './exposure';
import type { PublishedArticle } from './schedule';

/** 지정한 발행일들에 발행 완료된 원고를 가져온다. published_at 이 null 인 대기 원고는 제외한다. */
export async function fetchArticlesPublishedOn(dates: string[]): Promise<PublishedArticle[]> {
  if (dates.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .from('articles')
    .select('id, person_name, title, publish_date')
    .in('publish_date', dates)
    .not('published_at', 'is', null);
  if (error) throw new Error(`fetchArticlesPublishedOn: ${error.message}`);
  return (data ?? []) as PublishedArticle[];
}

/**
 * 검색 1회 결과를 그 쿼리를 공유하는 모든 원고에 기록한다.
 *
 * 미노출(`indexed=false`)도 반드시 남긴다 — 실패 사례가 이 프로젝트에서 가장 중요한 데이터다.
 * 같은 원고를 같은 날 두 번 넣는 것은 유니크 인덱스가 막으므로 upsert 로 흡수한다.
 */
export async function recordSerpChecks(args: {
  articleIds: string[];
  query: string;
  result: SerpResult;
  screenshot?: string | null;
}): Promise<void> {
  if (args.articleIds.length === 0) return;
  const rows = args.articleIds.map((article_id) => ({
    article_id,
    query: args.query,
    surface: 'pc-total',
    indexed: args.result.indexed,
    rank: args.result.rank,
    competitors: args.result.competitors,
    screenshot: args.screenshot ?? null,
    note: args.result.parseFailed ? 'parse-failed' : null,
  }));
  const { error } = await supabaseAdmin()
    .from('mih_serp_checks')
    .upsert(rows, { onConflict: 'article_id,surface,checked_on', ignoreDuplicates: true });
  if (error) throw new Error(`recordSerpChecks: ${error.message}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 이 파일 관련 에러 없음

- [ ] **Step 3: Commit**

```bash
git add lib/naver-search/serp-log.ts
git commit -m "feat(serp): record exposure checks including misses"
```

---

### Task 5: 일일 잡 배선

구동원을 RSS 에서 `articles` 테이블로 바꾼다. RSS 는 발행 여부만 알려주고 `article_id` 를 주지 않아 KPI 를 원고에 붙일 수 없고, D+3/7/14/30 도 표현할 수 없다.

**Discord 발송 동작은 그대로다** — D+1 이면서 노출된 건에만 스크린샷을 보낸다.

**Files:**
- Modify: `lib/naver-search/index.ts`

**Interfaces:**
- Consumes: `parseSerp` (Task 1), `targetDates`/`groupByQuery`/`kstDateMinus` (Task 3), `fetchArticlesPublishedOn`/`recordSerpChecks` (Task 4), 기존 `fetchNaverSearchHtml`/`buildNaverSearchUrl`/`fetchNaverSearchScreenshotPng`/`postScreenshotToDiscord`
- Produces:
  - `type JobSummary = { ok: true; dates: string[]; groups: number; articles: number; indexed: number; missed: number; posted: number; errors: string[] }`
  - `runDailyNaverScreenshotJob(args: { webhookUrl: string; date?: string }): Promise<JobSummary>`
  - `toSearchQuery` re-export (`export { toSearchQuery } from './schedule'`)
  - `getKstYesterday` 는 **삭제한다.** `kstDateMinus(1)` 이 같은 일을 하고, 이 함수를 import 하는
    곳은 리포 전체에 없다 (`grep` 확인 완료 — 유일한 외부 소비자는 `runDailyNaverScreenshotJob` 을 부르는 라우트다)

- [ ] **Step 1: Rewrite the job**

`lib/naver-search/index.ts` 를 아래로 교체:

```typescript
import { parseSerp } from './exposure';
import { postScreenshotToDiscord } from './discord';
import { fetchNaverSearchHtml, buildNaverSearchUrl } from './search';
import { fetchNaverSearchScreenshotPng } from './screenshot';
import { targetDates, groupByQuery, kstDateMinus, type PublishedArticle } from './schedule';
import { fetchArticlesPublishedOn, recordSerpChecks } from './serp-log';

export { toSearchQuery } from './schedule';

export type JobSummary = {
  ok: true;
  dates: string[];
  groups: number;
  articles: number;
  indexed: number;
  missed: number;
  posted: number;
  errors: string[];
};

/** maxDuration 300초 안에 끝내기 위한 동시 실행 수. 검색 1건은 1~2초다. */
const CONCURRENCY = 3;

async function inPool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

export async function runDailyNaverScreenshotJob(args: {
  webhookUrl: string;
  date?: string;
}): Promise<JobSummary> {
  const now = new Date();
  // date 파라미터가 오면 그 하루만 본다(수동 재실행용). 없으면 D+1/3/7/14/30 전부.
  const dates = args.date ? [args.date] : targetDates(now);
  const dPlus1 = args.date ?? kstDateMinus(1, now);

  const errors: string[] = [];
  let articles: PublishedArticle[] = [];
  try {
    articles = await fetchArticlesPublishedOn(dates);
  } catch (e) {
    errors.push((e as Error).message.slice(0, 200));
  }

  const groups = groupByQuery(articles);
  // D+1 그룹만 Discord 발송 대상이다. 나머지는 기록만 한다.
  const dPlus1Ids = new Set(articles.filter((a) => a.publish_date === dPlus1).map((a) => a.id));

  let indexed = 0;
  let missed = 0;
  let posted = 0;

  await inPool(groups, async (g) => {
    const searchUrl = buildNaverSearchUrl(g.query);
    try {
      const result = parseSerp(await fetchNaverSearchHtml(g.query));
      if (result.indexed) indexed += 1;
      else missed += 1;

      await recordSerpChecks({ articleIds: g.articleIds, query: g.query, result });

      const isDPlus1 = g.articleIds.some((id) => dPlus1Ids.has(id));
      if (result.indexed && isDPlus1) {
        const png = await fetchNaverSearchScreenshotPng(searchUrl);
        await postScreenshotToDiscord({
          webhookUrl: args.webhookUrl,
          keyword: g.query,
          searchUrl,
          pngBuffer: png,
        });
        posted += 1;
      }
    } catch (e) {
      errors.push(`${g.query}: ${(e as Error).message}`.slice(0, 200));
    }
  });

  return {
    ok: true,
    dates,
    groups: groups.length,
    articles: articles.length,
    indexed,
    missed,
    posted,
    errors,
  };
}
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: PASS. `tests/naver-search/*` 전부 통과. 기존 테스트는 `isMihExposed`·`discord`·`rss` 만 다루므로
`getKstYesterday` 삭제에 영향받지 않는다.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add lib/naver-search/index.ts
git commit -m "feat(serp): drive daily job from articles table and log every check"
```

- [ ] **Step 5: 죽은 RSS 모듈 삭제**

`lib/naver-search/rss.ts` 의 유일한 소비자는 방금 고친 `index.ts` 였다. 다른 RSS 사용처
(`app/api/rss/route.ts`, `supabase/functions/*`, `scripts/*`)는 각자 자기 `parseRss` 를 갖고 있다.
아래로 다시 확인한 뒤 지운다.

```bash
grep -rn "naver-search/rss" --include=*.ts --include=*.tsx --include=*.mjs app lib tests scripts supabase
```

Expected: `tests/naver-search/rss.test.ts` 한 줄만 남는다 (다른 소비자 없음). 그러면 삭제한다.

```bash
git rm lib/naver-search/rss.ts tests/naver-search/rss.test.ts
npm test
git commit -m "chore(serp): drop RSS-driven keyword source now that the job reads articles"
```

Expected: `npm test` 전체 통과

---

### Task 6: 실제 실행 확인 + 크론 등록

**Files:**
- Modify: `vercel.json` (`crons[]`)

**Interfaces:**
- Consumes: `GET /api/cron/naver-search-screenshots` (기존 라우트, 변경 불필요 — `date` 파라미터와 `CRON_SECRET` 인증이 이미 있다)
- Produces: 매일 10:00 KST 자동 실행

- [ ] **Step 1: 로컬에서 하루치 실행**

개발 서버를 띄운다.

```
npm run dev
```

다른 터미널에서, `.env.local` 의 `CRON_SECRET` 값을 넣어 어제 날짜로 한 번 돌린다.

```
curl -H "Authorization: Bearer <CRON_SECRET 값>" "http://localhost:3000/api/cron/naver-search-screenshots?date=2026-08-14"
```

Expected: `{"ok":true,"dates":["2026-08-14"],"groups":N,"articles":N,"indexed":N,"missed":N,"posted":N,"errors":[]}`
`indexed + missed` 가 `groups` 와 같아야 한다.

- [ ] **Step 2: 기록이 남았는지 확인 — 미노출 포함**

```bash
cat > scripts/_tmp-serp-check.mjs <<'EOF'
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s
  .from('mih_serp_checks')
  .select('query, indexed, rank, note, competitors')
  .order('checked_at', { ascending: false })
  .limit(200);
if (error) { console.log('FAIL', error.message); process.exit(1); }
const miss = data.filter((r) => !r.indexed).length;
const hit = data.filter((r) => r.indexed).length;
const bad = data.filter((r) => r.note === 'parse-failed').length;
console.log(`총 ${data.length} | 노출 ${hit} | 미노출 ${miss} | 파싱실패 ${bad}`);
console.log(data.slice(0, 5));
EOF
node --env-file=.env.local scripts/_tmp-serp-check.mjs; rm -f scripts/_tmp-serp-check.mjs
```

Expected: **미노출 건수가 0보다 크다.** 0 이면 미노출이 기록되지 않는다는 뜻이므로 Task 4 를 다시 본다.
`파싱실패` 가 전체와 같으면 네이버가 응답을 막았거나 링크 패턴이 바뀐 것이다 — Task 1 의 정규식을 실제 응답으로 다시 맞춘다.

- [ ] **Step 3: 크론 등록**

`vercel.json` 의 `"crons": []` 를 아래로 바꾼다.

```json
  "crons": [
    { "path": "/api/cron/naver-search-screenshots", "schedule": "0 1 * * *" }
  ]
```

`0 1 * * *` 은 UTC 01:00 = KST 10:00 이다. 기존 Discord 알림과 같은 시각을 유지한다.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "feat(serp): schedule daily exposure KPI cron at 10:00 KST"
```

- [ ] **Step 5: 배포 후 1회 수동 실행**

배포된 주소로 같은 요청을 한 번 보내 운영 환경에서도 도는지 확인한다.

```
curl -H "Authorization: Bearer <CRON_SECRET 값>" "https://<배포주소>/api/cron/naver-search-screenshots"
```

Expected: 200 과 요약 JSON. `errors` 가 비어 있거나 소수여야 한다.

---

## 완료 기준

- [ ] `mih_serp_checks` 에 매일 행이 쌓인다 — **노출된 건과 미노출된 건 모두**
- [ ] `indexed` 와 `rank` 가 분리 기록된다
- [ ] 발행 후 1·3·7·14·30일에 각각 확인된다
- [ ] 경쟁 문서 URL 이 최대 5건 함께 남는다
- [ ] 기존 Discord 스크린샷 알림이 이전과 동일하게 동작한다
- [ ] `npm test` 전체 통과

## 다음 계획 (이 계획 밖)

- **계획 2 — 임베딩 모델 선정 실측** (스펙 §7.3): 장르 판별 시험으로 모델 확정
- **계획 3 — 지식 그래프 + 에이전트 체인** (스펙 §5·§6)
- **계획 4 — 임베딩 지표를 체인에 연결** (스펙 §7.5~§7.10)
- **계획 5 — 주간 SEO 분석** (스펙 §8): KPI 2~3주 축적 후
