# 대시보드 개편 Phase 1 — 데이터 모델 + RSS 자동 매칭 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI 변경 없이 데이터 모델을 `keywords` 테이블에서 `articles` 통합 모델로 전환하고, 네이버 RSS를 10분마다 매칭해 `articles.published_at`을 자동으로 채운다. Phase 1 완료 시점부터 기존 UI를 그대로 두고도 발행 상태가 DB에 정확히 반영된다.

**Architecture:** Postgres 마이그레이션 4개로 스키마를 진화시키고, 순수 함수 `lib/rss-matcher.ts`(TDD)와 Supabase Edge Function `rss-sync`를 추가한다. pg_cron이 10분마다 Edge Function을 호출하고, 매칭에 실패한 RSS 항목은 `unmatched_rss_items` 테이블에 적재된다.

**Tech Stack:** Supabase Postgres + Edge Functions (Deno), Node.js 20+, vitest (신규), Next.js 15 (변경 거의 없음), pg_cron + `net.http_post`

**관련 스펙:** `docs/superpowers/specs/2026-05-22-dashboard-redesign-design.md` 섹션 3·4·11

---

## 사전 준비 / 가정

- 작업 브랜치: `feat/dashboard-redesign-phase1` (현재 `feat/supabase-discord-pg-cron`에서 분기)
- `.env.local`에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 이미 있어야 함
- Supabase CLI 가 설치돼 있고 `supabase link --project-ref <ref>` 가 완료된 상태 (`supabase/.temp/linked-project.json` 존재)
- Supabase 프로젝트에 `pg_cron`, `pg_net` extension이 이미 활성화돼 있음 (기존 `discord-notify` 가 사용 중)

확인 명령:
```bash
npx supabase status
```
Expected: 로컬 정보 또는 "Linked project" 출력.

---

## 파일 구조 (이번 Phase에서 만들거나 수정하는 파일)

```
supabase/
├── migrations/
│   ├── 20260522000000_articles_meta_columns.sql        (NEW)
│   ├── 20260522000001_unmatched_rss_items.sql          (NEW)
│   ├── 20260522000002_keywords_to_articles.sql         (NEW — 데이터 이관 only)
│   └── 20260522000003_rss_sync_cron.sql                (NEW — pg_cron 등록)
└── functions/
    └── rss-sync/
        ├── index.ts                                    (NEW)
        └── deno.json                                   (NEW)
lib/
└── rss-matcher.ts                                      (NEW — 순수 함수, 클라이언트/Edge 양쪽 공유)
tests/
└── rss-matcher.test.ts                                 (NEW)
scripts/
├── apply-rss-sync-schedule.js                          (NEW — pg_cron 등록 트리거)
└── (collect-instagram-images.js / publish-article.js / migrate-articles-to-db.js: 변경 없음)
package.json                                            (MODIFY — vitest 추가)
vitest.config.ts                                        (NEW)
tsconfig.json                                           (MODIFY — vitest 타입 추가)
```

---

## Task 1: 작업 브랜치 분기 + 백업

**Files:** 없음 (git 작업만)

- [ ] **Step 1.1: 현재 작업 트리가 깨끗한지 확인**

Run:
```bash
git status
```
Expected: `nothing to commit, working tree clean` 또는 `On branch feat/supabase-discord-pg-cron / clean`

- [ ] **Step 1.2: 새 브랜치 분기**

Run:
```bash
git checkout -b feat/dashboard-redesign-phase1
```
Expected: `Switched to a new branch 'feat/dashboard-redesign-phase1'`

- [ ] **Step 1.3: 현재 articles · keywords 행 수 백업 출력**

기존 데이터를 잃지 않도록 출발선을 기록한다.

Run (PowerShell 또는 bash):
```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const a=await sb.from('articles').select('id',{count:'exact',head:true});const k=await sb.from('keywords').select('id',{count:'exact',head:true});console.log('articles:',a.count,'keywords:',k.count);})"
```
Expected: 두 숫자 출력. 메모해 두고 마이그레이션 후 비교.

---

## Task 2: vitest 셋업

`lib/rss-matcher.ts`를 TDD로 작성하려면 테스트 러너가 필요하다. 현재 프로젝트엔 테스트 도구가 없다.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.json`

- [ ] **Step 2.1: vitest 설치**

Run:
```bash
npm install -D vitest @vitest/coverage-v8
```
Expected: 설치 성공, `package.json` devDependencies에 추가.

- [ ] **Step 2.2: `package.json`에 스크립트 추가**

`scripts` 객체에 다음 두 줄을 추가한다 (기존 키 보존).

```json
"test": "vitest run",
"test:watch": "vitest"
```

수정 후 `scripts` 영역 예시:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest",
  "legacy:build-manifest": "node scripts/build-manifest.js",
  "legacy:dev-server": "node scripts/dev-server.js",
  "publish": "node scripts/publish-article.js",
  "migrate": "node scripts/migrate-articles-to-db.js && node scripts/migrate-keywords-to-db.js",
  "secrets:push": "node scripts/secrets-push.js",
  "secrets:pull": "node scripts/secrets-pull.js",
  "collect:images": "node scripts/collect-instagram-images.js"
}
```

- [ ] **Step 2.3: `vitest.config.ts` 생성**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 2.4: `tsconfig.json`에 vitest 타입 등록**

기존 `compilerOptions.types`(있다면) 또는 새 키 추가.

수정 전 `tsconfig.json`을 Read한 뒤, `compilerOptions` 안에 다음을 보장:
```json
"types": ["vitest/globals", "node"]
```

이미 `types`가 있으면 두 항목을 추가만. `node`가 이미 있으면 `vitest/globals`만.

- [ ] **Step 2.5: 빈 테스트로 동작 확인**

Create `tests/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run:
```bash
npm test
```
Expected: `1 passed`.

- [ ] **Step 2.6: sanity 테스트 제거 + 커밋**

```bash
rm tests/sanity.test.ts
git add package.json package-lock.json vitest.config.ts tsconfig.json
git commit -m "chore: vitest 도입 (Phase 1 RSS matcher TDD용)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `lib/rss-matcher.ts` — title 정규화 함수 (TDD)

매칭 로직의 1차 단계: 양쪽 문자열을 정규화해 정확 비교. 공백 다중·전각 공백·앞뒤 공백·SE의 NBSP 차이 흡수.

**Files:**
- Test: `tests/rss-matcher.test.ts`
- Create: `lib/rss-matcher.ts`

- [ ] **Step 3.1: 정규화 실패 테스트 작성**

Create `tests/rss-matcher.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '@/lib/rss-matcher';

describe('normalizeTitle', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeTitle('  [홍길동  섭외]   강연 ')).toBe('[홍길동 섭외] 강연');
  });

  it('replaces non-breaking spaces with normal space', () => {
    expect(normalizeTitle('[홍길동 섭외] 강연')).toBe('[홍길동 섭외] 강연');
  });

  it('collapses full-width spaces (U+3000) to normal space', () => {
    expect(normalizeTitle('[홍길동　섭외]　강연')).toBe('[홍길동 섭외] 강연');
  });
});
```

- [ ] **Step 3.2: 실패 확인**

Run:
```bash
npm test -- tests/rss-matcher.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/rss-matcher'`.

- [ ] **Step 3.3: `normalizeTitle` 최소 구현**

Create `lib/rss-matcher.ts`:
```ts
export function normalizeTitle(s: string): string {
  return s
    .replace(/[ 　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 3.4: 통과 확인**

```bash
npm test -- tests/rss-matcher.test.ts
```
Expected: 3 passed.

- [ ] **Step 3.5: 커밋**

```bash
git add tests/rss-matcher.test.ts lib/rss-matcher.ts
git commit -m "feat(rss): title 정규화 함수 (NBSP/전각공백/다중공백)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `lib/rss-matcher.ts` — 키워드 추출 함수 (TDD)

스펙 4.1의 3차 fallback: title에서 `[키워드 섭외]` 또는 `[키워드]` 부분을 뽑아낸다. discord-notify Edge Function에 이미 비슷한 정규식이 있지만 여기 별도로 정의해 재사용 가능하게 만든다.

**Files:**
- Modify: `tests/rss-matcher.test.ts`
- Modify: `lib/rss-matcher.ts`

- [ ] **Step 4.1: 추출 테스트 추가**

Append to `tests/rss-matcher.test.ts`:
```ts
import { extractTitleKeyword } from '@/lib/rss-matcher';

describe('extractTitleKeyword', () => {
  it('extracts keyword from "[이름 섭외] ..." pattern', () => {
    expect(extractTitleKeyword('[홍길동 섭외] 강연 행사')).toBe('홍길동');
  });

  it('extracts keyword from "[이름 강연 섭외] ..." pattern', () => {
    expect(extractTitleKeyword('[안정환 강연 섭외] 기업 특강')).toBe('안정환 강연');
  });

  it('extracts keyword from "[키워드] ..." pattern without "섭외" suffix', () => {
    expect(extractTitleKeyword('[행사공연] 대학 축제 섭외')).toBe('행사공연');
  });

  it('returns null when no bracketed prefix exists', () => {
    expect(extractTitleKeyword('홍길동 섭외 일반 제목')).toBe(null);
  });

  it('handles NBSP inside brackets', () => {
    expect(extractTitleKeyword('[홍길동 섭외] 강연')).toBe('홍길동');
  });
});
```

- [ ] **Step 4.2: 실패 확인**

```bash
npm test -- tests/rss-matcher.test.ts
```
Expected: FAIL — `extractTitleKeyword is not a function` 또는 비슷한 import 오류.

- [ ] **Step 4.3: 구현**

Append to `lib/rss-matcher.ts`:
```ts
export function extractTitleKeyword(rawTitle: string): string | null {
  const title = normalizeTitle(rawTitle);
  const m = title.match(/^\[([^\]]+?)(?:\s+섭외)?\]/);
  return m ? m[1].trim() : null;
}
```

- [ ] **Step 4.4: 통과 확인**

```bash
npm test -- tests/rss-matcher.test.ts
```
Expected: 8 passed (이전 3 + 신규 5).

- [ ] **Step 4.5: 커밋**

```bash
git add tests/rss-matcher.test.ts lib/rss-matcher.ts
git commit -m "feat(rss): title 첫 대괄호 키워드 추출

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `lib/rss-matcher.ts` — 매칭 함수 (TDD)

본 매칭 로직. RSS 항목 1개와 후보 articles 리스트를 받아 매칭 결과를 반환. 우선순위:

1. **정확 title 일치** (normalize 후)
2. **`person_name + " 섭외"` 변형** — RSS title이 `[<person_name> 섭외] ...` 형태일 때
3. **키워드 추출 fallback** — `extractTitleKeyword(rss.title)` 결과가 `person_name` 또는 `slug`와 정확히 일치
4. 모두 실패 → null

후보가 여럿이면 `created_at`이 가장 오래된 미발행 article 선택 (FIFO).

**Files:**
- Modify: `tests/rss-matcher.test.ts`
- Modify: `lib/rss-matcher.ts`

- [ ] **Step 5.1: 타입과 매칭 테스트 추가**

Append to `tests/rss-matcher.test.ts`:
```ts
import { matchRssItem, type ArticleCandidate, type RssItem } from '@/lib/rss-matcher';

function mkArticle(over: Partial<ArticleCandidate>): ArticleCandidate {
  return {
    id: 'a1',
    person_name: '홍길동',
    slug: 'hong',
    title: '[홍길동 섭외] 기업 강연',
    agency: 'mih_speaker',
    created_at: '2026-05-20T00:00:00Z',
    published_at: null,
    ...over,
  };
}

describe('matchRssItem', () => {
  const baseRss: RssItem = {
    agency: 'mih_speaker',
    title: '[홍길동 섭외] 기업 강연',
    link: 'https://blog.naver.com/mih_speaker/1',
    pub_ts: 1779_400_000_000,
  };

  it('matches when titles are exactly equal after normalization', () => {
    const result = matchRssItem(baseRss, [mkArticle({})]);
    expect(result.matched?.id).toBe('a1');
    expect(result.reason).toBe('exact_title');
  });

  it('matches when DB title differs only in spacing/NBSP', () => {
    const rss = { ...baseRss, title: '[홍길동 섭외]  기업 강연' };
    const result = matchRssItem(rss, [mkArticle({ title: '[홍길동 섭외] 기업 강연' })]);
    expect(result.matched?.id).toBe('a1');
    expect(result.reason).toBe('exact_title');
  });

  it('matches by person_name when RSS title is "[person 섭외] ..." and exact title differs', () => {
    const rss = { ...baseRss, title: '[홍길동 섭외] 다른 부제' };
    const result = matchRssItem(rss, [mkArticle({})]);
    expect(result.matched?.id).toBe('a1');
    expect(result.reason).toBe('person_name_bracket');
  });

  it('matches by extracted keyword to person_name', () => {
    const rss = { ...baseRss, title: '[홍길동] 별도 부제' };
    const result = matchRssItem(rss, [mkArticle({ slug: 'something-else' })]);
    expect(result.matched?.id).toBe('a1');
    expect(result.reason).toBe('keyword_to_person');
  });

  it('matches by extracted keyword to slug when person_name differs', () => {
    const rss = { ...baseRss, title: '[hong] 부제' };
    const a = mkArticle({ person_name: '다른이름', slug: 'hong' });
    const result = matchRssItem(rss, [a]);
    expect(result.matched?.id).toBe('a1');
    expect(result.reason).toBe('keyword_to_slug');
  });

  it('returns null match when nothing fits', () => {
    const rss = { ...baseRss, title: '[엉뚱한키워드] xxx' };
    const result = matchRssItem(rss, [mkArticle({})]);
    expect(result.matched).toBe(null);
    expect(result.reason).toBe('none');
  });

  it('skips candidates whose agency does not match', () => {
    const rss = { ...baseRss, agency: 'mih_casting' as const };
    const result = matchRssItem(rss, [mkArticle({ agency: 'mih_speaker' })]);
    expect(result.matched).toBe(null);
  });

  it('skips already-published candidates and picks the unpublished one', () => {
    const published = mkArticle({ id: 'pub', published_at: '2026-05-21T00:00:00Z' });
    const unpub = mkArticle({ id: 'unpub', created_at: '2026-05-22T00:00:00Z' });
    const result = matchRssItem(baseRss, [published, unpub]);
    expect(result.matched?.id).toBe('unpub');
  });

  it('when multiple unpublished candidates match, picks the oldest created_at (FIFO)', () => {
    const older = mkArticle({ id: 'older', created_at: '2026-05-10T00:00:00Z' });
    const newer = mkArticle({ id: 'newer', created_at: '2026-05-20T00:00:00Z' });
    const result = matchRssItem(baseRss, [newer, older]);
    expect(result.matched?.id).toBe('older');
  });
});
```

- [ ] **Step 5.2: 실패 확인**

```bash
npm test -- tests/rss-matcher.test.ts
```
Expected: 새 9개 테스트 실패 (import 오류).

- [ ] **Step 5.3: 타입과 매칭 함수 구현**

Append to `lib/rss-matcher.ts`:
```ts
export type AgencySlug = 'mih_speaker' | 'mih_casting' | 'mih_agency';

export type ArticleCandidate = {
  id: string;
  person_name: string;
  slug: string;
  title: string;
  agency: AgencySlug;
  created_at: string;
  published_at: string | null;
};

export type RssItem = {
  agency: AgencySlug;
  title: string;
  link: string;
  pub_ts: number;
};

export type MatchReason =
  | 'exact_title'
  | 'person_name_bracket'
  | 'keyword_to_person'
  | 'keyword_to_slug'
  | 'none';

export type MatchResult = {
  matched: ArticleCandidate | null;
  reason: MatchReason;
};

function pickOldest(cands: ArticleCandidate[]): ArticleCandidate {
  return [...cands].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}

export function matchRssItem(rss: RssItem, candidates: ArticleCandidate[]): MatchResult {
  const sameAgency = candidates.filter((c) => c.agency === rss.agency && c.published_at === null);
  if (sameAgency.length === 0) return { matched: null, reason: 'none' };

  const rssNorm = normalizeTitle(rss.title);

  const exact = sameAgency.filter((c) => normalizeTitle(c.title) === rssNorm);
  if (exact.length > 0) return { matched: pickOldest(exact), reason: 'exact_title' };

  const rssKeyword = extractTitleKeyword(rss.title);
  if (rssKeyword) {
    const personMatch = sameAgency.filter(
      (c) => normalizeTitle(c.person_name) === normalizeTitle(rssKeyword)
    );
    if (personMatch.length > 0) {
      const expectedBracket = `[${rssKeyword} 섭외]`;
      const rssHasBracket = rssNorm.startsWith(expectedBracket);
      return {
        matched: pickOldest(personMatch),
        reason: rssHasBracket ? 'person_name_bracket' : 'keyword_to_person',
      };
    }

    const slugMatch = sameAgency.filter((c) => c.slug === rssKeyword);
    if (slugMatch.length > 0) return { matched: pickOldest(slugMatch), reason: 'keyword_to_slug' };
  }

  return { matched: null, reason: 'none' };
}
```

- [ ] **Step 5.4: 통과 확인**

```bash
npm test
```
Expected: 17 passed (3 normalize + 5 extract + 9 match).

- [ ] **Step 5.5: 커밋**

```bash
git add tests/rss-matcher.test.ts lib/rss-matcher.ts
git commit -m "feat(rss): 매칭 함수 (정확/대괄호/키워드 fallback + FIFO)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 마이그레이션 1 — `articles` 메타 컬럼 추가

**Files:**
- Create: `supabase/migrations/20260522000000_articles_meta_columns.sql`

- [ ] **Step 6.1: 마이그레이션 파일 작성**

```sql
-- articles에 메타 + 발행 추적 컬럼 추가 (keywords 폐기 준비)
alter table articles add column if not exists instagram_url    text;
alter table articles add column if not exists category         text;
alter table articles add column if not exists notes            text default '';
alter table articles add column if not exists published_at     timestamptz;
alter table articles add column if not exists published_url    text;
alter table articles add column if not exists published_source text
  check (published_source is null or published_source in ('rss', 'manual'));

-- 자주 쓰는 정렬 인덱스 (스펙 3.3)
create index if not exists articles_published_at_idx
  on articles (published_at desc)
  where published_at is not null;

create index if not exists articles_pool_fifo_idx
  on articles (agency, created_at)
  where published_at is null;
```

- [ ] **Step 6.2: 로컬 dry-run (선택, supabase CLI 로컬 스택이 있을 때만)**

```bash
npx supabase db reset --linked=false 2>&1 | tail -20
```
이 명령은 로컬 컨테이너가 필요. 로컬 스택을 띄우지 않는 경우 다음 step으로 건너뛴다.

- [ ] **Step 6.3: 원격에 적용**

```bash
npx supabase db push
```
Expected: 새 마이그레이션 파일을 검출하고 적용. 끝에 `Finished supabase db push`.

문제 시: `npx supabase migration list` 로 적용 여부 확인.

- [ ] **Step 6.4: 컬럼 존재 검증**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{data,error}=await sb.from('articles').select('id,instagram_url,category,notes,published_at,published_url,published_source').limit(1);if(error){console.error(error);process.exit(1);}console.log('OK:',Object.keys(data?.[0]||{}));})"
```
Expected: 새 컬럼들이 키 리스트에 포함.

- [ ] **Step 6.5: 커밋**

```bash
git add supabase/migrations/20260522000000_articles_meta_columns.sql
git commit -m "feat(db): articles 메타 + 발행 추적 컬럼 (instagram_url, category, notes, published_*)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 마이그레이션 2 — `unmatched_rss_items` 테이블

**Files:**
- Create: `supabase/migrations/20260522000001_unmatched_rss_items.sql`

- [ ] **Step 7.1: 파일 작성**

```sql
-- RSS에 떴는데 articles와 매칭 안 된 항목들. 60일 보관.
create table if not exists unmatched_rss_items (
  agency        text    not null check (agency in ('mih_speaker','mih_casting','mih_agency')),
  link          text    not null,
  title         text    not null,
  pub_ts        bigint  not null,
  first_seen_at timestamptz default now(),
  last_seen_at  timestamptz default now(),
  primary key (agency, link)
);

create index if not exists unmatched_rss_items_pub_idx
  on unmatched_rss_items (pub_ts desc);

alter table unmatched_rss_items enable row level security;

create policy "service_role_only" on unmatched_rss_items
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
```

- [ ] **Step 7.2: 적용**

```bash
npx supabase db push
```
Expected: `unmatched_rss_items` 테이블 생성 완료.

- [ ] **Step 7.3: 검증**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{error}=await sb.from('unmatched_rss_items').select('*',{count:'exact',head:true});console.log('unmatched_rss_items:',error?error.message:'OK (0 rows)');})"
```
Expected: `OK (0 rows)`.

- [ ] **Step 7.4: 커밋**

```bash
git add supabase/migrations/20260522000001_unmatched_rss_items.sql
git commit -m "feat(db): unmatched_rss_items 테이블 (RSS↔DB 점검용)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 마이그레이션 3 — keywords → articles 데이터 이관

**중요:** keywords 테이블은 이번 phase에서 drop 하지 않는다 (Phase 3에서 처리). 데이터만 articles로 복사 + 잔여 분은 `keywords_legacy`로 백업.

**Files:**
- Create: `supabase/migrations/20260522000002_keywords_to_articles.sql`

- [ ] **Step 8.1: 파일 작성**

```sql
-- keywords의 메타를 articles로 이관.
-- 매칭 정책: keywords.keyword == articles.person_name (인물 원고 다수가 이 매핑)
-- 그 외 매칭 안 되는 키워드 행은 keywords_legacy에 백업.

create table if not exists keywords_legacy as
  select * from keywords where false;

-- 1) person_name 매칭으로 articles에 instagram_url/category/notes/published_url 채우기
update articles a
set
  instagram_url = coalesce(a.instagram_url, k.instagram),
  category      = coalesce(a.category, k.category),
  notes         = case when a.notes is null or a.notes = '' then coalesce(k.notes, '') else a.notes end,
  published_url = coalesce(a.published_url, k.published_url)
from keywords k
where k.keyword = a.person_name
  and (
    a.instagram_url is null or
    a.category is null or
    (a.notes is null or a.notes = '') or
    a.published_url is null
  );

-- 2) 위에서 매칭된 keyword 키를 기록해두기
create temp table _matched_keywords as
  select distinct k.id
  from keywords k
  join articles a on a.person_name = k.keyword;

-- 3) 매칭되지 않은 keywords를 legacy로 복사 (수동 정리 후 Phase 3에서 drop)
insert into keywords_legacy
select * from keywords
where id not in (select id from _matched_keywords)
on conflict do nothing;

-- (안전을 위해 원본 keywords는 이 마이그레이션에서 건드리지 않는다)
```

- [ ] **Step 8.2: 적용**

```bash
npx supabase db push
```
Expected: SQL 실행 완료.

- [ ] **Step 8.3: 이관 결과 검증**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const a=await sb.from('articles').select('id',{count:'exact',head:true}).not('instagram_url','is',null);const l=await sb.from('keywords_legacy').select('id',{count:'exact',head:true});console.log('articles with instagram_url:',a.count);console.log('keywords_legacy:',l.count);})"
```
Expected: `articles with instagram_url` 가 0보다 큰 숫자, `keywords_legacy`는 매칭 실패한 keyword 수.

매칭 실패가 너무 많으면 (예: 전체 keywords 수와 같다) `keyword == person_name` 매칭이 실제 데이터와 안 맞는 거다 → 작업 중단하고 사용자에게 보고. 다음 step으로 진행하지 않는다.

- [ ] **Step 8.4: keywords_legacy 잔여 항목 샘플 출력 (사용자 확인용)**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{data}=await sb.from('keywords_legacy').select('id,keyword,category,instagram').limit(20);console.log(JSON.stringify(data,null,2));})"
```
Expected: 매칭 실패 키워드 샘플 출력. 사용자에게 확인 요청.

- [ ] **Step 8.5: 커밋**

```bash
git add supabase/migrations/20260522000002_keywords_to_articles.sql
git commit -m "feat(db): keywords → articles 데이터 이관 (잔여분은 keywords_legacy로 백업)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: rss-sync Edge Function 작성

매칭 로직은 `lib/rss-matcher.ts`에 있지만 Edge Function은 Deno라서 import 경로가 다르다. 우선 Edge Function 안에 매칭 로직을 인라인으로 복사한 뒤, Phase 2에서 클라이언트와 공유하는 방식으로 정리한다 (Edge ↔ Next.js 공유는 별도 패키지 빌드가 필요하므로 1차에서는 중복 허용).

**Files:**
- Create: `supabase/functions/rss-sync/index.ts`
- Create: `supabase/functions/rss-sync/deno.json`

- [ ] **Step 9.1: `deno.json` 작성**

```json
{
  "imports": {
    "supabase": "jsr:@supabase/supabase-js@2"
  }
}
```

- [ ] **Step 9.2: `index.ts` 작성**

```ts
// 네이버 RSS를 fetch해 articles와 매칭 → published_at/published_url을 채운다.
// 매칭 실패 항목은 unmatched_rss_items에 upsert.
//
// 트리거: pg_cron이 10분마다 net.http_post 로 호출.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type AgencySlug = 'mih_speaker' | 'mih_casting' | 'mih_agency';
const SLUGS: AgencySlug[] = ['mih_speaker', 'mih_casting', 'mih_agency'];

type RssItem = { agency: AgencySlug; title: string; link: string; pub_ts: number };
type Candidate = {
  id: string;
  person_name: string;
  slug: string;
  title: string;
  agency: AgencySlug;
  created_at: string;
  published_at: string | null;
};

function normalizeTitle(s: string): string {
  return s.replace(/[ 　]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTitleKeyword(rawTitle: string): string | null {
  const title = normalizeTitle(rawTitle);
  const m = title.match(/^\[([^\]]+?)(?:\s+섭외)?\]/);
  return m ? m[1].trim() : null;
}

function pickOldest(cands: Candidate[]): Candidate {
  return [...cands].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}

type MatchReason = 'exact_title' | 'person_name_bracket' | 'keyword_to_person' | 'keyword_to_slug' | 'none';

function matchRssItem(rss: RssItem, candidates: Candidate[]): { matched: Candidate | null; reason: MatchReason } {
  const sameAgency = candidates.filter((c) => c.agency === rss.agency && c.published_at === null);
  if (sameAgency.length === 0) return { matched: null, reason: 'none' };

  const rssNorm = normalizeTitle(rss.title);

  const exact = sameAgency.filter((c) => normalizeTitle(c.title) === rssNorm);
  if (exact.length > 0) return { matched: pickOldest(exact), reason: 'exact_title' };

  const rssKeyword = extractTitleKeyword(rss.title);
  if (rssKeyword) {
    const personMatch = sameAgency.filter((c) => normalizeTitle(c.person_name) === normalizeTitle(rssKeyword));
    if (personMatch.length > 0) {
      const expectedBracket = `[${rssKeyword} 섭외]`;
      const rssHasBracket = rssNorm.startsWith(expectedBracket);
      return { matched: pickOldest(personMatch), reason: rssHasBracket ? 'person_name_bracket' : 'keyword_to_person' };
    }
    const slugMatch = sameAgency.filter((c) => c.slug === rssKeyword);
    if (slugMatch.length > 0) return { matched: pickOldest(slugMatch), reason: 'keyword_to_slug' };
  }

  return { matched: null, reason: 'none' };
}

function parseRss(xml: string): { title: string; link: string; pub_ts: number }[] {
  const items: { title: string; link: string; pub_ts: number }[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const title = (body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? body.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? '';
    const rawLink = body.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? '';
    const link = rawLink.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    const pubDate = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    const pub_ts = pubDate ? new Date(pubDate).getTime() : 0;
    if (title && link && pub_ts) items.push({ title, link, pub_ts });
  }
  return items;
}

async function fetchRss(slug: AgencySlug): Promise<{ title: string; link: string; pub_ts: number }[]> {
  const res = await fetch(`https://rss.blog.naver.com/${slug}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MIH-RSS-Sync/1.0)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text());
}

Deno.serve(async () => {
  const startedAt = Date.now();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1) 미발행 articles 후보 적재
  const { data: unpub, error: e1 } = await sb
    .from('articles')
    .select('id,person_name,slug,title,agency,created_at,published_at')
    .is('published_at', null);
  if (e1) {
    return new Response(JSON.stringify({ ok: false, error: e1.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const candidates = (unpub || []) as Candidate[];

  // 2) 3개 RSS 동시 fetch
  const results = await Promise.all(SLUGS.map(async (slug) => {
    try {
      const items = await fetchRss(slug);
      return { slug, items, error: null as string | null };
    } catch (e) {
      return { slug, items: [], error: (e as Error).message };
    }
  }));

  let matchedCount = 0;
  let unmatchedCount = 0;
  const errors: string[] = [];

  for (const { slug, items, error } of results) {
    if (error) errors.push(`${slug}: ${error}`);
    for (const item of items) {
      const rss: RssItem = { agency: slug, title: item.title, link: item.link, pub_ts: item.pub_ts };
      const { matched, reason } = matchRssItem(rss, candidates);

      if (matched && reason !== 'none') {
        const { error: upErr } = await sb.from('articles')
          .update({
            published_at: new Date(item.pub_ts).toISOString(),
            published_url: item.link,
            published_source: 'rss',
          })
          .eq('id', matched.id)
          .is('published_at', null); // 멱등: 누군가 먼저 채웠으면 skip
        if (upErr) errors.push(`update ${matched.id}: ${upErr.message}`);
        else {
          matchedCount++;
          // 같은 매칭이 다음 RSS 항목에 재사용되지 않도록 candidates에서 제거
          const idx = candidates.findIndex((c) => c.id === matched.id);
          if (idx >= 0) candidates.splice(idx, 1);
        }
      } else {
        unmatchedCount++;
        await sb.from('unmatched_rss_items').upsert({
          agency: slug,
          link: item.link,
          title: item.title,
          pub_ts: item.pub_ts,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'agency,link' });
      }
    }
  }

  // 3) 60일 지난 unmatched 정리
  const sixtyDaysAgo = Date.now() - 60 * 24 * 3600_000;
  await sb.from('unmatched_rss_items').delete().lt('pub_ts', sixtyDaysAgo);

  return new Response(
    JSON.stringify({
      ok: true,
      duration_ms: Date.now() - startedAt,
      matched: matchedCount,
      unmatched: unmatchedCount,
      errors,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

- [ ] **Step 9.3: 로컬 lint (선택)**

Run:
```bash
npx deno check supabase/functions/rss-sync/index.ts
```
Expected: 오류 없음. Deno가 없으면 skip.

- [ ] **Step 9.4: Edge Function 배포**

```bash
npx supabase functions deploy rss-sync
```
Expected: `Deployed Function rss-sync` 출력.

JWT verification은 기본값(켜짐) 유지. pg_cron이 `Authorization: Bearer <service-role-key>` 헤더로 호출하므로 정상 통과한다. 외부에서 service-role key 없이는 호출 불가능.

- [ ] **Step 9.5: 1회 수동 호출로 동작 확인**

```bash
curl -sS -X POST "$( node -e 'import(\"fs\").then(({readFileSync})=>{for(const l of readFileSync(\".env.local\",\"utf8\").split(\"\\n\")){const m=l.match(/^([^#=]+)=[\"\\x27]?(.+?)[\"\\x27]?\\s*$/);if(m&&m[1].trim()===\"SUPABASE_URL\")console.log(m[2].trim());}}' )/functions/v1/rss-sync"
```
Expected: JSON 출력 `{ "ok": true, "matched": N, "unmatched": M, ... }`.

PowerShell에선 위 명령 어려울 수 있다. 대안:
```bash
node -e "import('fs').then(async({readFileSync})=>{for(const l of readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const r=await fetch(process.env.SUPABASE_URL+'/functions/v1/rss-sync',{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY}});console.log(r.status,await r.text());})"
```
Expected: `200 {"ok":true,...}`.

- [ ] **Step 9.6: 매칭 결과 검증**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const p=await sb.from('articles').select('id',{count:'exact',head:true}).not('published_at','is',null);const u=await sb.from('unmatched_rss_items').select('agency,title,link').limit(10);console.log('published:',p.count);console.log('unmatched sample:',u.data);})"
```
Expected: `published`가 0보다 큰 숫자, `unmatched sample` 0~수 건.

- [ ] **Step 9.7: 커밋**

```bash
git add supabase/functions/rss-sync/
git commit -m "feat(edge): rss-sync Edge Function (네이버 RSS 매칭 → articles.published_at)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: pg_cron — rss-sync 10분 주기 등록

`discord-notify`가 이미 pg_cron + `net.http_post` 패턴으로 등록돼 있을 것이다. 같은 패턴을 따라 신규 잡을 추가한다.

**Files:**
- Create: `supabase/migrations/20260522000003_rss_sync_cron.sql`

- [ ] **Step 10.1: 기존 cron 잡 확인**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{data,error}=await sb.rpc('cron_job_list_fake');console.log(error?error.message:data);})" 2>&1 | head
```
위는 실패해도 OK (RPC 없음). 다음 step에서 SQL로 직접 조회.

대안 — `supabase/.temp/linked-project.json`에서 project ref를 읽고 Supabase Dashboard SQL editor 에서 직접 `select * from cron.job;` 실행해 기존 잡을 확인. (Edge Function URL 포맷 참고용)

- [ ] **Step 10.2: 마이그레이션 파일 작성**

```sql
-- rss-sync Edge Function을 10분마다 호출
-- net.http_post 패턴은 기존 discord-notify cron 잡과 동일

do $$
declare
  fn_url text := current_setting('app.settings.supabase_url', true);
begin
  -- pg_cron이 정의된 잡 이름이 이미 있으면 unschedule 후 재등록 (멱등)
  perform cron.unschedule('rss-sync')
    where exists (select 1 from cron.job where jobname = 'rss-sync');
end$$;

select cron.schedule(
  'rss-sync',
  '*/10 * * * *',
  $$
    select net.http_post(
      url := (select value from app_settings where key = 'EDGE_BASE_URL') || '/rss-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select value from app_settings where key = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
```

**주의:** 위는 `app_settings` 테이블에 `EDGE_BASE_URL` (예: `https://<ref>.functions.supabase.co`)과 `SUPABASE_SERVICE_ROLE_KEY` 두 행이 존재한다는 전제. 없으면 다음 step에서 채운다.

- [ ] **Step 10.3: app_settings에 필요한 키 시드**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const u=new URL(process.env.SUPABASE_URL);const ref=u.host.split('.')[0];const edge='https://'+ref+'.functions.supabase.co';const{error:e1}=await sb.from('app_settings').upsert({key:'EDGE_BASE_URL',value:edge,description:'Supabase Edge Functions base URL'});const{error:e2}=await sb.from('app_settings').upsert({key:'SUPABASE_SERVICE_ROLE_KEY',value:process.env.SUPABASE_SERVICE_ROLE_KEY,description:'service role key for pg_cron http_post'});console.log('EDGE_BASE_URL:',e1?e1.message:'OK ('+edge+')');console.log('SERVICE_KEY:',e2?e2.message:'OK');})"
```
Expected: 두 줄 모두 OK.

- [ ] **Step 10.4: 마이그레이션 적용**

```bash
npx supabase db push
```
Expected: cron 잡 스케줄 등록 완료.

- [ ] **Step 10.5: 잡 등록 검증**

Supabase Dashboard SQL editor (또는 가능하면 RPC) 에서 직접:
```sql
select jobname, schedule, command from cron.job where jobname = 'rss-sync';
```
Expected: 1 row.

명령 가능하면:
```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const r2=await fetch(process.env.SUPABASE_URL+'/rest/v1/rpc/cron_job_list',{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:'{}'});console.log(r2.status,await r2.text());})"
```
RPC가 없으면 status 404. 그 경우 Dashboard에서 직접 확인.

- [ ] **Step 10.6: 10~12분 대기 후 자동 실행 결과 확인**

10분 기다린 뒤:
```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const p=await sb.from('articles').select('id',{count:'exact',head:true}).not('published_at','is',null);const u=await sb.from('unmatched_rss_items').select('agency,title,last_seen_at').order('last_seen_at',{ascending:false}).limit(5);console.log('published total:',p.count);console.log('latest unmatched:',u.data);})"
```
Expected: `published total` 이 직전 수치와 같거나 증가, `latest unmatched.last_seen_at`이 10분 이내로 갱신.

- [ ] **Step 10.7: 커밋**

```bash
git add supabase/migrations/20260522000003_rss_sync_cron.sql
git commit -m "feat(cron): rss-sync 10분 간격 스케줄 등록

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: 운영 모니터링 (수동, 자동화 아님)

Phase 1의 안정성 확인. 마이그레이션 후 1~2일은 사용자가 직접 점검한다. 코드 변경은 없다.

- [ ] **Step 11.1: 매칭률 1차 점검**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);for(const agency of ['mih_speaker','mih_casting','mih_agency']){const p=await sb.from('articles').select('id',{count:'exact',head:true}).eq('agency',agency).not('published_at','is',null);const t=await sb.from('articles').select('id',{count:'exact',head:true}).eq('agency',agency);console.log(agency+': '+p.count+'/'+t.count+' published');}})"
```
Expected: 3계정 모두 published/total 출력. 매칭률이 비정상적으로 낮으면(예: 50% 미만) `lib/rss-matcher.ts` 케이스 추가 필요 → 별도 PR.

- [ ] **Step 11.2: unmatched 샘플 점검**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{data}=await sb.from('unmatched_rss_items').select('agency,title,pub_ts').order('pub_ts',{ascending:false}).limit(20);console.log(JSON.stringify(data,null,2));})"
```
샘플을 사용자가 직접 확인. 모두 정당하게 매칭되지 않은 항목(네이버 직접 작성, 광고 글 등)인지 검증.

오매칭이 보이면 (`articles`에 있는데 매칭 못 함) `rss-matcher.test.ts`에 해당 케이스 추가하고 알고리즘 보강 후 Edge Function 재배포.

- [ ] **Step 11.3: 일주일간 운영 후 phase 1 종료**

별도 step은 없음. Phase 2 plan 작성을 사용자가 다시 트리거하면 그 때 진행.

---

## 완료 기준 (DoD)

- [ ] `articles` 테이블에 6개 신규 컬럼 존재
- [ ] `unmatched_rss_items` 테이블 존재 (service_role only RLS)
- [ ] `keywords_legacy` 백업 테이블 존재 (원본 `keywords`는 그대로 유지)
- [ ] `lib/rss-matcher.ts` + `tests/rss-matcher.test.ts` 통과 (17개 테스트)
- [ ] Supabase Edge Function `rss-sync` 배포됨
- [ ] pg_cron `rss-sync` 잡이 10분 주기로 등록됨
- [ ] 최소 1회 자동 실행 결과로 `articles.published_at`이 채워진 행이 확인됨
- [ ] 모든 마이그레이션이 git 커밋됨
- [ ] 기존 UI(/, /keywords, /rss)는 변경 없음 — 데이터가 추가됐을 뿐

---

## 스펙과의 매핑

| 스펙 섹션 | 이 plan의 task |
|---|---|
| 3.1 articles 컬럼 6개 | Task 6 |
| 3.2 keywords 폐기 + legacy 백업 | Task 8 |
| 3.3 인덱스 | Task 6 |
| 3.4 RLS | Task 7 |
| 4.1 매칭 알고리즘 | Task 3·4·5 + Task 9 |
| 4.2 pg_cron 10분 | Task 10 |
| 4.4 발행됨 수동 토글 | (다음 plan — UI Phase) |
| 10. 매칭 실패 모니터링 | Task 11 |
| 11.1 단계 1·2 | Task 6~10 |
| 12. 단위/통합 테스트 | Task 3·4·5 |

---

## 다음 단계 (이 plan 종료 시점)

Plan 2 작성: 신규 UI(`/dashboard-v2`) — Tailwind+shadcn 셋업, 메인 칸반 페이지, 카드 모달, /rss 신규 화면, /articles/[id] 풀페이지.

Plan 3 작성: 스위치 오버(/ ← /dashboard-v2 교체, /keywords 제거) + 정리 (`keywords` 테이블 drop).
