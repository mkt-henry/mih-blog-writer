# 네이버 통합검색 노출 스크린샷 Discord 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매일 10:00 KST에 어제(D-1) 발행된 키워드를 네이버 통합검색에 던지고, 검색 결과 페이지에 mih 블로그가 노출된 경우에만 viewport 스크린샷을 별도 Discord 채널 webhook으로 발송한다.

**Architecture:** Vercel Cron이 신규 라우트 `/api/cron/naver-search-screenshots`를 호출 → Supabase `articles` 테이블에서 D-1 발행분을 가져와 키워드를 dedupe → 단일 puppeteer-core + @sparticuz/chromium 인스턴스로 키워드별 통합검색 페이지를 순차 로드 → HTML 내 mih 블로그 슬러그 등장 여부로 노출 판정 → 노출된 경우만 viewport 스크린샷을 Discord webhook에 multipart로 발송한다. 기존 `discord-notify` Edge Function(D-0 발행 알림)은 변경하지 않는다.

**Tech Stack:** Next.js 15 App Router (Node.js runtime), Vercel Cron, puppeteer-core 23.x, @sparticuz/chromium 131.x, Supabase JS, vitest.

**Reference spec:** `docs/superpowers/specs/2026-05-25-naver-search-screenshot-discord-design.md`

---

## File Structure

신규 파일:
- `lib/naver-search/keywords.ts` — articles[] → unique keywords[] (extract + fallback + dedupe). 순수함수.
- `lib/naver-search/exposure.ts` — 검색 결과 HTML에서 mih 블로그 노출 여부 판정. 순수함수.
- `lib/naver-search/discord.ts` — Discord webhook에 multipart로 스크린샷 발송.
- `lib/naver-search/chromium.ts` — puppeteer-core + @sparticuz/chromium 부팅 헬퍼.
- `lib/naver-search/index.ts` — `runDailyNaverScreenshotJob()` 큰 흐름 (Supabase 조회 → Chromium → 키워드 루프).
- `app/api/cron/naver-search-screenshots/route.ts` — Vercel Function. `CRON_SECRET` 인증 + index.ts 호출.
- `tests/naver-search/keywords.test.ts` — keywords.ts 단위 테스트.
- `tests/naver-search/exposure.test.ts` — exposure.ts 단위 테스트.
- `tests/naver-search/discord.test.ts` — discord.ts 단위 테스트 (fetch 모킹).

수정 파일:
- `vercel.json` — `functions[]`에 신규 라우트 메모리/타임아웃 설정, `crons[]` 항목 추가.
- `package.json` — `puppeteer-core`, `@sparticuz/chromium` 의존성 추가.

환경변수 (Vercel Dashboard 등록):
- `CRON_SECRET` — Vercel Cron이 자동으로 `Authorization: Bearer` 헤더에 실어주는 비밀값
- `NAVER_SEARCH_DISCORD_WEBHOOK_URL` — 이미지 발송 채널 webhook URL (Discord에서 재발급 후 등록)

---

### Task 1: 의존성 설치

**Files:**
- Modify: `package.json`

- [ ] **Step 1: puppeteer-core와 @sparticuz/chromium 설치**

Run:
```bash
npm install puppeteer-core@^23 @sparticuz/chromium@^131
```

이 두 패키지는 production 의존성이다. `puppeteer-core`는 Chromium 바이너리를 함께 다운로드하지 않는 가벼운 버전이며, `@sparticuz/chromium`이 Lambda/Vercel 환경용 사전 빌드된 Chromium 바이너리를 제공한다.

- [ ] **Step 2: 설치 확인**

Run:
```bash
npm ls puppeteer-core @sparticuz/chromium
```

Expected: 두 패키지 모두 `package.json`의 `dependencies` 아래에 등장.

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add puppeteer-core + @sparticuz/chromium for naver screenshot job"
```

---

### Task 2: keywords.ts — articles → unique keywords (TDD)

**Files:**
- Create: `lib/naver-search/keywords.ts`
- Test: `tests/naver-search/keywords.test.ts`

`articles` 행 배열에서 검색용 키워드를 뽑고 중복을 제거하는 순수함수. title의 `[XXX 섭외]` 패턴이 매칭되지 않으면 `person_name`을 폴백으로 사용한다. 기존 `lib/rss-matcher.ts`의 `extractTitleKeyword`를 재사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/naver-search/keywords.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractUniqueKeywords, type ArticleForKeyword } from '@/lib/naver-search/keywords';

function mk(over: Partial<ArticleForKeyword>): ArticleForKeyword {
  return {
    title: '[홍길동 섭외] 강연 행사',
    person_name: '홍길동',
    ...over,
  };
}

describe('extractUniqueKeywords', () => {
  it('extracts keywords from [XXX 섭외] title pattern', () => {
    const out = extractUniqueKeywords([mk({ title: '[안정환 강연 섭외] 기업 특강', person_name: '안정환' })]);
    expect(out).toEqual(['안정환 강연']);
  });

  it('extracts keywords from [XXX] without 섭외 suffix', () => {
    const out = extractUniqueKeywords([mk({ title: '[리더십 강의] 사내교육', person_name: '' })]);
    expect(out).toEqual(['리더십 강의']);
  });

  it('falls back to person_name when title bracket missing', () => {
    const out = extractUniqueKeywords([mk({ title: '강연 행사 안내', person_name: '홍길동' })]);
    expect(out).toEqual(['홍길동']);
  });

  it('dedupes the same keyword across multiple agencies', () => {
    const out = extractUniqueKeywords([
      mk({ title: '[홍길동 섭외] A', person_name: '홍길동' }),
      mk({ title: '[홍길동 섭외] B', person_name: '홍길동' }),
    ]);
    expect(out).toEqual(['홍길동']);
  });

  it('preserves insertion order for distinct keywords', () => {
    const out = extractUniqueKeywords([
      mk({ title: '[A 섭외] x', person_name: 'A' }),
      mk({ title: '[B 섭외] y', person_name: 'B' }),
      mk({ title: '[C 섭외] z', person_name: 'C' }),
    ]);
    expect(out).toEqual(['A', 'B', 'C']);
  });

  it('skips an article entirely when neither title nor person_name yield a keyword', () => {
    const out = extractUniqueKeywords([
      mk({ title: '제목 없음', person_name: '' }),
      mk({ title: '[홍길동 섭외] x', person_name: '홍길동' }),
    ]);
    expect(out).toEqual(['홍길동']);
  });

  it('trims whitespace in fallback person_name', () => {
    const out = extractUniqueKeywords([mk({ title: '본문만', person_name: '  홍길동  ' })]);
    expect(out).toEqual(['홍길동']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- tests/naver-search/keywords.test.ts`
Expected: FAIL — `Cannot find module '@/lib/naver-search/keywords'`.

- [ ] **Step 3: 최소 구현**

`lib/naver-search/keywords.ts`:
```ts
import { extractTitleKeyword } from '@/lib/rss-matcher';

export type ArticleForKeyword = {
  title: string;
  person_name: string;
};

export function extractUniqueKeywords(articles: ArticleForKeyword[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of articles) {
    const fromTitle = extractTitleKeyword(a.title);
    const kw = (fromTitle ?? a.person_name).trim();
    if (!kw) continue;
    if (seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- tests/naver-search/keywords.test.ts`
Expected: 7개 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/naver-search/keywords.ts tests/naver-search/keywords.test.ts
git commit -m "feat(naver-search): extractUniqueKeywords from D-1 articles"
```

---

### Task 3: exposure.ts — 검색 결과 HTML에 mih 블로그 노출 판정 (TDD)

**Files:**
- Create: `lib/naver-search/exposure.ts`
- Test: `tests/naver-search/exposure.test.ts`

검색 결과 페이지 HTML 문자열을 받아 mih 블로그 슬러그 3개 중 하나라도 등장하면 `true`를 반환한다. 순수함수.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/naver-search/exposure.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isMihExposed, MIH_BLOG_SLUGS } from '@/lib/naver-search/exposure';

describe('MIH_BLOG_SLUGS', () => {
  it('contains the three agency slugs', () => {
    expect(MIH_BLOG_SLUGS).toEqual(['mih_speaker', 'mih_casting', 'mih_agency']);
  });
});

describe('isMihExposed', () => {
  it('returns true when HTML contains blog.naver.com/mih_speaker', () => {
    const html = '<a href="https://blog.naver.com/mih_speaker/12345">post</a>';
    expect(isMihExposed(html)).toBe(true);
  });

  it('returns true when HTML contains blog.naver.com/mih_casting', () => {
    expect(isMihExposed('something blog.naver.com/mih_casting/9999 ...')).toBe(true);
  });

  it('returns true when HTML contains blog.naver.com/mih_agency', () => {
    expect(isMihExposed('blog.naver.com/mih_agency/1 ')).toBe(true);
  });

  it('returns false when HTML has only unrelated naver blog URLs', () => {
    const html = '<a href="https://blog.naver.com/other_blog/123">other</a>';
    expect(isMihExposed(html)).toBe(false);
  });

  it('returns false on empty HTML', () => {
    expect(isMihExposed('')).toBe(false);
  });

  it('returns false when slug appears without blog.naver.com prefix', () => {
    expect(isMihExposed('just text mih_speaker without context')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- tests/naver-search/exposure.test.ts`
Expected: FAIL — `Cannot find module '@/lib/naver-search/exposure'`.

- [ ] **Step 3: 최소 구현**

`lib/naver-search/exposure.ts`:
```ts
export const MIH_BLOG_SLUGS = ['mih_speaker', 'mih_casting', 'mih_agency'] as const;

export function isMihExposed(html: string): boolean {
  if (!html) return false;
  return MIH_BLOG_SLUGS.some((s) => html.includes(`blog.naver.com/${s}`));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- tests/naver-search/exposure.test.ts`
Expected: 7개 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/naver-search/exposure.ts tests/naver-search/exposure.test.ts
git commit -m "feat(naver-search): isMihExposed HTML check"
```

---

### Task 4: discord.ts — Discord webhook multipart 발송 (TDD)

**Files:**
- Create: `lib/naver-search/discord.ts`
- Test: `tests/naver-search/discord.test.ts`

키워드, 검색 URL, PNG Buffer를 받아 Discord webhook URL에 `multipart/form-data`로 POST한다. fetch를 모킹해 단위 테스트한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/naver-search/discord.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postScreenshotToDiscord } from '@/lib/naver-search/discord';

const ORIGINAL_FETCH = globalThis.fetch;

describe('postScreenshotToDiscord', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.useRealTimers();
  });

  it('posts multipart with payload_json containing keyword + URL and PNG file', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      captured = { url: url as string, init: init as RequestInit };
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await postScreenshotToDiscord({
      webhookUrl: 'https://discord.test/hook',
      keyword: '안정환 강연',
      searchUrl: 'https://search.naver.com/search.naver?query=%EC%95%88%EC%A0%95%ED%99%98',
      pngBuffer: png,
    });

    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('https://discord.test/hook');
    expect(captured!.init.method).toBe('POST');
    expect(captured!.init.body).toBeInstanceOf(FormData);

    const fd = captured!.init.body as FormData;
    const payloadJson = fd.get('payload_json') as string;
    const parsed = JSON.parse(payloadJson);
    expect(parsed.content).toContain('안정환 강연');
    expect(parsed.content).toContain('search.naver.com');

    const file = fd.get('files[0]');
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe('image/png');
  });

  it('throws on 4xx/5xx response', async () => {
    globalThis.fetch = vi.fn(async () => new Response('rate limited', { status: 429 })) as typeof fetch;

    await expect(
      postScreenshotToDiscord({
        webhookUrl: 'https://discord.test/hook',
        keyword: 'x',
        searchUrl: 'https://search.naver.com/x',
        pngBuffer: Buffer.from([0]),
      }),
    ).rejects.toThrow(/429/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- tests/naver-search/discord.test.ts`
Expected: FAIL — `Cannot find module '@/lib/naver-search/discord'`.

- [ ] **Step 3: 최소 구현**

`lib/naver-search/discord.ts`:
```ts
export type PostScreenshotArgs = {
  webhookUrl: string;
  keyword: string;
  searchUrl: string;
  pngBuffer: Buffer;
};

export async function postScreenshotToDiscord(args: PostScreenshotArgs): Promise<void> {
  const { webhookUrl, keyword, searchUrl, pngBuffer } = args;

  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: `🔎 ${keyword}\n${searchUrl}` }));

  const blob = new Blob([pngBuffer], { type: 'image/png' });
  const safeName = keyword.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 64) || 'screenshot';
  fd.append('files[0]', new File([blob], `${safeName}.png`, { type: 'image/png' }));

  const res = await fetch(webhookUrl, { method: 'POST', body: fd });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord webhook failed: ${res.status} ${text}`.slice(0, 500));
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- tests/naver-search/discord.test.ts`
Expected: 2개 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/naver-search/discord.ts tests/naver-search/discord.test.ts
git commit -m "feat(naver-search): postScreenshotToDiscord webhook sender"
```

---

### Task 5: chromium.ts — Chromium launcher 헬퍼

**Files:**
- Create: `lib/naver-search/chromium.ts`

puppeteer-core + @sparticuz/chromium 부팅 코드를 한 곳에 모은다. 단위 테스트는 작성하지 않는다 (sparticuz 바이너리는 Vercel 런타임에서만 동작).

- [ ] **Step 1: 구현**

`lib/naver-search/chromium.ts`:
```ts
import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export async function launchChromium(): Promise<Browser> {
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    defaultViewport: { width: 1280, height: 800 },
  });
}
```

- [ ] **Step 2: 타입 체크**

Run:
```bash
npx tsc --noEmit
```

Expected: 에러 없음 (puppeteer-core 23.x 기준 `Browser` export 존재).

- [ ] **Step 3: 커밋**

```bash
git add lib/naver-search/chromium.ts
git commit -m "feat(naver-search): launchChromium helper"
```

---

### Task 6: index.ts — 큰 흐름 함수 `runDailyNaverScreenshotJob`

**Files:**
- Create: `lib/naver-search/index.ts`

큰 흐름:
1. KST 기준 어제 날짜 계산
2. Supabase `articles` 조회 (`publish_date = D-1`)
3. `extractUniqueKeywords()`
4. Chromium 부팅
5. 키워드별 직렬 처리: `page.goto` → HTML로 노출 판정 → 노출되면 스크린샷 → Discord 발송
6. 결과 요약 반환

단위 테스트는 작성하지 않음 (Chromium 의존). Preview 배포에서 검증.

- [ ] **Step 1: 구현**

`lib/naver-search/index.ts`:
```ts
import { supabaseAdmin } from '@/lib/supabase';
import { extractUniqueKeywords } from './keywords';
import { isMihExposed } from './exposure';
import { postScreenshotToDiscord } from './discord';
import { launchChromium } from './chromium';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getKstYesterday(now: Date = new Date()): string {
  const kstYesterday = new Date(now.getTime() + KST_OFFSET_MS - 24 * 60 * 60 * 1000);
  return kstYesterday.toISOString().slice(0, 10);
}

export type JobSummary = {
  ok: true;
  date: string;
  total: number;
  posted: number;
  skipped: number;
  errors: string[];
};

export async function runDailyNaverScreenshotJob(args: {
  webhookUrl: string;
}): Promise<JobSummary> {
  const date = getKstYesterday();

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('articles')
    .select('title, agency, person_name, published_url')
    .eq('publish_date', date)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`articles select failed: ${error.message}`);

  const articles = data ?? [];
  const keywords = extractUniqueKeywords(
    articles.map((a) => ({ title: a.title as string, person_name: (a.person_name as string) ?? '' })),
  );

  if (keywords.length === 0) {
    return { ok: true, date, total: 0, posted: 0, skipped: 0, errors: [] };
  }

  const errors: string[] = [];
  let posted = 0;
  let skipped = 0;

  const browser = await launchChromium();
  try {
    for (const keyword of keywords) {
      const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
      const page = await browser.newPage();
      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 15_000 });
        const html = await page.content();
        if (!isMihExposed(html)) {
          skipped += 1;
          continue;
        }
        const png = (await page.screenshot({ type: 'png', fullPage: false })) as Buffer;
        await postScreenshotToDiscord({
          webhookUrl: args.webhookUrl,
          keyword,
          searchUrl,
          pngBuffer: png,
        });
        posted += 1;
      } catch (e) {
        errors.push(`${keyword}: ${(e as Error).message}`.slice(0, 200));
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return { ok: true, date, total: keywords.length, posted, skipped, errors };
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add lib/naver-search/index.ts
git commit -m "feat(naver-search): runDailyNaverScreenshotJob orchestrator"
```

---

### Task 7: API route — `/api/cron/naver-search-screenshots`

**Files:**
- Create: `app/api/cron/naver-search-screenshots/route.ts`

`CRON_SECRET` 헤더 검증 후 `runDailyNaverScreenshotJob`을 호출하고 결과 JSON 반환.

- [ ] **Step 1: 구현**

`app/api/cron/naver-search-screenshots/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { runDailyNaverScreenshotJob } from '@/lib/naver-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const webhookUrl = process.env.NAVER_SEARCH_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: 'NAVER_SEARCH_DISCORD_WEBHOOK_URL not set' }, { status: 500 });
  }

  try {
    const summary = await runDailyNaverScreenshotJob({ webhookUrl });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 새 라우트 `/api/cron/naver-search-screenshots`가 빌드 출력에 표시되고 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add app/api/cron/naver-search-screenshots/route.ts
git commit -m "feat(api): /api/cron/naver-search-screenshots route with CRON_SECRET guard"
```

---

### Task 8: vercel.json — cron 등록 + function 메모리 설정

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: 수정**

`vercel.json` 전체를 다음으로 교체:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "next build",
  "installCommand": "npm install",
  "functions": {
    "app/api/manuscripts/route.ts": { "maxDuration": 30 },
    "app/api/manuscripts/[id]/route.ts": { "maxDuration": 15 },
    "app/api/articles/[id]/route.ts": { "maxDuration": 15 },
    "app/api/rss/route.ts": { "maxDuration": 15 },
    "app/api/rss-sync/route.ts": { "maxDuration": 30 },
    "app/api/cron/naver-search-screenshots/route.ts": { "maxDuration": 300, "memory": 1024 }
  },
  "crons": [
    { "path": "/api/cron/naver-search-screenshots", "schedule": "0 1 * * *" }
  ]
}
```

`schedule: "0 1 * * *"`은 매일 01:00 UTC = 10:00 KST.

- [ ] **Step 2: JSON 형식 확인**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('ok')"
```

Expected: `ok` 출력.

- [ ] **Step 3: 커밋**

```bash
git add vercel.json
git commit -m "chore(vercel): register /api/cron/naver-search-screenshots cron at 01:00 UTC"
```

---

### Task 9: 환경변수 등록 + Preview 배포 검증

**Files:** (없음)

이 단계는 코드 변경이 아닌 운영 절차. 사용자가 직접 수행한다.

- [ ] **Step 1: Discord webhook 재발급 후 Vercel 환경변수 등록**

채팅으로 노출됐던 webhook URL은 보안상 Discord에서 reset 후 새 URL을 사용한다.

Vercel Dashboard → Project → Settings → Environment Variables:
- `NAVER_SEARCH_DISCORD_WEBHOOK_URL` = `https://discord.com/api/webhooks/...` (재발급된 새 URL)
- `CRON_SECRET` = 임의의 긴 랜덤 문자열 (예: `openssl rand -hex 32` 결과)

세 환경(Production / Preview / Development) 중 최소 Production·Preview에는 등록.

- [ ] **Step 2: Preview 배포 트리거**

Run:
```bash
git push origin <feature-branch>
```

PR을 만들면 Vercel이 Preview 배포 URL을 생성한다.

- [ ] **Step 3: Preview에서 라우트 수동 호출**

`<preview-url>`을 Vercel Preview URL로 치환:
```bash
curl -i -H "Authorization: Bearer <CRON_SECRET_value>" \
  https://<preview-url>/api/cron/naver-search-screenshots
```

Expected: HTTP 200 + JSON 응답.
- 어제 발행분이 있고 일부가 노출된 상태라면: `{ok: true, date, total: N, posted: P, skipped: S, errors: []}` 그리고 Discord 채널에 P건의 스크린샷이 도착.
- 어제 발행분이 0건이거나 전부 노출 안 됨: `{ok: true, ..., posted: 0}` 그리고 Discord에 아무것도 안 옴.

- [ ] **Step 4: 인증 실패 케이스 확인**

Run:
```bash
curl -i https://<preview-url>/api/cron/naver-search-screenshots
```

Expected: HTTP 401, `{"error":"unauthorized"}`.

- [ ] **Step 5: 프로덕션 머지**

Preview 검증이 통과되면 PR을 main으로 머지한다. 머지 시점부터 Vercel이 매일 01:00 UTC(10:00 KST)에 자동 호출하기 시작한다.

---

## Notes for the implementer

- 본 기능은 기존 `supabase/functions/discord-notify/index.ts`(D-0 발행 알림)와 **완전히 독립적**이다. 기존 Edge Function은 건드리지 않는다.
- 키워드 추출 로직은 `lib/rss-matcher.ts`의 `extractTitleKeyword`를 그대로 import해 재사용한다. 이쪽 코드를 수정하지 말 것.
- `@sparticuz/chromium`은 로컬 macOS/Windows에서 실행이 까다로워 로컬 통합 테스트는 시도하지 말 것. 브라우저 동작은 Vercel Preview 배포에서만 검증한다.
- 키워드 처리는 반드시 **직렬**(`for-of`)로 한다. Chromium 인스턴스를 여러 개 띄우면 Vercel function 메모리 초과 위험.
- 노출 판정은 *HTML 문자열에 슬러그가 포함됐는가*만 본다. 더 정교한 DOM 파싱이나 위치 추출은 본 스코프 밖.
