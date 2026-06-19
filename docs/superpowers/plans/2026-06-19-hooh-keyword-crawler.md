# hooh.kr 강사 키워드 크롤러 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호오컨설팅(hooh.kr) 강사 목록을 크롤링해 신규 강사만 `keywords` 테이블에 적재하는 스크립트·스킬·테스트를 추가한다.

**Architecture:** artsro 크롤러를 병렬 복제한다. 신규 파일만 추가하고 기존 artsro 코드는 손대지 않는다. 공통 순수함수(`norm`/`isDuplicate`/`collectOutputNames`)는 artsro 모듈에서 import한다. `POST /ajax/teacher_list.asp`를 `page=1`부터 순회하며 빈 페이지에서 종료하고, dry-run → 사용자 확인 → `--apply` 게이트로 멱등 upsert한다.

**Tech Stack:** Node.js ESM(.mjs), vitest, Supabase REST(`scripts/lib/supabase-rest.js`).

## Global Constraints

- 전원 `category='강연자'`, `agency='mih_speaker'` 고정 (계정 분할·셔플 없음).
- `id=hooh-{m_idx}` — 재실행 멱등.
- `notes = 직함 | 강의키워드` (` | `로 결합, 빈 값은 제외).
- `source = https://www.hooh.kr/sub/teacher/next.asp?m_idx={idx}`.
- 중복 판정 대상: `keywords.keyword` + `articles.person_name` + `output/` html 파일명.
- `--apply` 없으면 절대 DB 쓰기 금지(dry-run).
- 검증된 파싱 정규식(수정 금지):
  ```
  /next\.asp\?m_idx=(\d+)"[\s\S]*?class="lname[^"]*">[\s\S]*?<p>([^<]+)<\/p>\s*<span>([^<]*)<\/span>[\s\S]*?<p class="cate">([^<]*)<\/p>/g
  ```

---

### Task 1: 순수함수 — parseListPage + buildRow

**Files:**
- Create: `scripts/crawl-hooh-keywords.mjs`
- Test: `tests/crawl-hooh.test.ts`

**Interfaces:**
- Consumes: `norm`, `isDuplicate`, `collectOutputNames` from `scripts/crawl-artsro-keywords.mjs` (import 용도, 본 태스크에선 미사용).
- Produces:
  - `parseListPage(html: string) => Array<{ idx: string, name: string, title: string, cate: string }>`
  - `buildRow({ idx, name, title, cate }) => { id, keyword, category, agency, notes, source, is_active }`

- [ ] **Step 1: Write the failing test**

`tests/crawl-hooh.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseListPage, buildRow } from '@/scripts/crawl-hooh-keywords.mjs';

const SAMPLE = `
<ul class="list clearfix">
  <li>
    <a href="/sub/teacher/next.asp?m_idx=6" onclick="hash_form()">
      <div class="img"><img src="/upload/member/2323(8).png" alt="" /></div>
      <div class="txt">
        <div class="lname"> <!-- top 강사는 prm 클래스 추가 -->
          <p>김창옥</p>
          <span>김창옥휴먼컴퍼니 대표</span>
        </div>
        <p class="cate">동기부여, 열정, 소통</p> <!-- 텍스트 길이제한이 필요합니다 -->
      </div>
    </a>
  </li>
  <li>
    <a href="/sub/teacher/next.asp?m_idx=26" onclick="hash_form()">
      <div class="img"><img src="/x.jpg" alt="" /></div>
      <div class="txt">
        <div class="lname prm"> <!-- top 강사는 prm 클래스 추가 -->
          <p>김준혁</p>
          <span>국회의원, 전)교수</span>
        </div>
        <p class="cate">인문학, 역사</p>
      </div>
    </a>
  </li>
</ul>`;

describe('parseListPage', () => {
  it('extracts idx, name, title, cate per teacher', () => {
    expect(parseListPage(SAMPLE)).toEqual([
      { idx: '6', name: '김창옥', title: '김창옥휴먼컴퍼니 대표', cate: '동기부여, 열정, 소통' },
      { idx: '26', name: '김준혁', title: '국회의원, 전)교수', cate: '인문학, 역사' },
    ]);
  });

  it('returns empty array when no teacher items', () => {
    expect(parseListPage('<div class="top">전체 0 명</div>')).toEqual([]);
  });
});

describe('buildRow', () => {
  it('fixes category/agency and joins title|cate into notes', () => {
    expect(buildRow({ idx: '6', name: '김창옥', title: '김창옥휴먼컴퍼니 대표', cate: '동기부여, 열정' })).toEqual({
      id: 'hooh-6',
      keyword: '김창옥',
      category: '강연자',
      agency: 'mih_speaker',
      notes: '김창옥휴먼컴퍼니 대표 | 동기부여, 열정',
      source: 'https://www.hooh.kr/sub/teacher/next.asp?m_idx=6',
      is_active: true,
    });
  });

  it('drops empty parts from notes', () => {
    expect(buildRow({ idx: '7', name: '홍길동', title: '', cate: '리더십' }).notes).toBe('리더십');
    expect(buildRow({ idx: '8', name: '임꺽정', title: '작가', cate: '' }).notes).toBe('작가');
    expect(buildRow({ idx: '9', name: '아무개', title: '', cate: '' }).notes).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crawl-hooh.test.ts`
Expected: FAIL — `Failed to resolve import` 또는 `parseListPage is not a function` (파일/함수 없음).

- [ ] **Step 3: Write minimal implementation**

`scripts/crawl-hooh-keywords.mjs` (헤더 + 순수함수):
```js
// scripts/crawl-hooh-keywords.mjs
// 호오컨설팅(hooh.kr) 강사 목록 크롤러 → keywords 테이블 신규 추가 (전원 강연자/mih_speaker)
//
// 사용법:
//   node scripts/crawl-hooh-keywords.mjs           # dry-run (쓰기 없음)
//   node scripts/crawl-hooh-keywords.mjs --apply    # 신규 행 upsert

import { pathToFileURL } from 'node:url';
import { supabaseSelect, supabaseUpsert } from './lib/supabase-rest.js';
import { loadEnv } from './lib/env.js';
import { norm, isDuplicate, collectOutputNames } from './crawl-artsro-keywords.mjs';

loadEnv();

const LIST_RE =
  /next\.asp\?m_idx=(\d+)"[\s\S]*?class="lname[^"]*">[\s\S]*?<p>([^<]+)<\/p>\s*<span>([^<]*)<\/span>[\s\S]*?<p class="cate">([^<]*)<\/p>/g;

export function parseListPage(html) {
  const out = [];
  for (const m of (html || '').matchAll(LIST_RE)) {
    out.push({ idx: m[1], name: m[2].trim(), title: m[3].trim(), cate: m[4].trim() });
  }
  return out;
}

export function buildRow({ idx, name, title, cate }) {
  const notes = [title, cate].map((s) => (s || '').trim()).filter(Boolean).join(' | ');
  return {
    id: `hooh-${idx}`,
    keyword: name,
    category: '강연자',
    agency: 'mih_speaker',
    notes,
    source: `https://www.hooh.kr/sub/teacher/next.asp?m_idx=${idx}`,
    is_active: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/crawl-hooh.test.ts`
Expected: PASS (5 assertions across parseListPage·buildRow).

- [ ] **Step 5: Commit**

```bash
git add scripts/crawl-hooh-keywords.mjs tests/crawl-hooh.test.ts
git commit -m "feat: hooh 크롤러 parseListPage/buildRow 순수함수 + 테스트"
```

---

### Task 2: 페이지네이션 — crawlAll

**Files:**
- Modify: `scripts/crawl-hooh-keywords.mjs` (append)
- Test: `tests/crawl-hooh.test.ts` (append)

**Interfaces:**
- Consumes: `parseListPage` (Task 1).
- Produces: `crawlAll(fetchPage: (page:number)=>Promise<string>, opts?: { maxPage?: number }) => Promise<Array<{idx,name,title,cate}>>`

- [ ] **Step 1: Write the failing test**

`tests/crawl-hooh.test.ts`에 추가:
```ts
import { crawlAll } from '@/scripts/crawl-hooh-keywords.mjs';

function pageHtml(ids: number[]): string {
  return ids.map((id) =>
    `<li><a href="/sub/teacher/next.asp?m_idx=${id}" onclick="hash_form()">` +
    `<div class="lname"><p>P${id}</p><span>t${id}</span></div>` +
    `<p class="cate">c${id}</p></a></li>`,
  ).join('');
}

describe('crawlAll', () => {
  it('paginates from page 1 until an empty page', async () => {
    const pages: Record<number, number[]> = { 1: [1, 2], 2: [3], 3: [] };
    const fetchPage = async (page: number) => pageHtml(pages[page] ?? []);
    const rows = await crawlAll(fetchPage);
    expect(rows.map((r) => r.idx)).toEqual(['1', '2', '3']);
  });

  it('stops when a page repeats already-seen ids (clamped)', async () => {
    const fetchPage = async () => pageHtml([1, 2]); // 항상 같은 페이지
    const rows = await crawlAll(fetchPage);
    expect(rows.map((r) => r.idx)).toEqual(['1', '2']);
  });

  it('respects maxPage safety cap', async () => {
    let calls = 0;
    const fetchPage = async (page: number) => { calls++; return pageHtml([page]); };
    const rows = await crawlAll(fetchPage, { maxPage: 3 });
    expect(calls).toBe(3);
    expect(rows.map((r) => r.idx)).toEqual(['1', '2', '3']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crawl-hooh.test.ts`
Expected: FAIL — `crawlAll is not a function`.

- [ ] **Step 3: Write minimal implementation**

`scripts/crawl-hooh-keywords.mjs`의 `buildRow` 아래에 추가:
```js
export async function crawlAll(fetchPage, { maxPage = 300 } = {}) {
  const acc = [];
  const seen = new Set();
  for (let page = 1; page <= maxPage; page++) {
    const html = await fetchPage(page);
    const rows = parseListPage(html);
    if (rows.length === 0) break;          // 마지막 페이지 도달
    let fresh = 0;
    for (const r of rows) {
      if (seen.has(r.idx)) continue;
      seen.add(r.idx);
      acc.push(r);
      fresh++;
    }
    if (fresh === 0) break;                // clamp된 반복 페이지 → 종료
  }
  return acc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/crawl-hooh.test.ts`
Expected: PASS (parseListPage·buildRow·crawlAll 전부 통과).

- [ ] **Step 5: Commit**

```bash
git add scripts/crawl-hooh-keywords.mjs tests/crawl-hooh.test.ts
git commit -m "feat: hooh 크롤러 crawlAll 페이지네이션 + 테스트"
```

---

### Task 3: 실행 배선 — fetchPage + main + npm 스크립트

**Files:**
- Modify: `scripts/crawl-hooh-keywords.mjs` (append fetchPage·main·엔트리)
- Modify: `package.json` (scripts에 `crawl:hooh` 추가)

**Interfaces:**
- Consumes: `crawlAll`, `buildRow`, `norm`, `isDuplicate`, `collectOutputNames`, `supabaseSelect`, `supabaseUpsert`.
- Produces: CLI 동작(`npm run crawl:hooh` dry-run / `--apply`). 본 태스크의 검증은 실제 dry-run 실행 리포트.

- [ ] **Step 1: 실행부 구현**

`scripts/crawl-hooh-keywords.mjs` 끝에 추가:
```js
const AJAX_URL = 'https://www.hooh.kr/ajax/teacher_list.asp';
const UA = 'Mozilla/5.0 (compatible; mih-blog-writer/1.0)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(page) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(AJAX_URL, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `page=${page}&sort=0`,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await sleep(400); // 예의상 rate limit
      return html;
    } catch (e) {
      lastErr = e;
      await sleep(800 * (attempt + 1)); // 백오프
    }
  }
  console.warn(`  ⚠ fetch 실패(스킵): page=${page} — ${lastErr?.message}`);
  return ''; // 빈 페이지 → 종료 신호
}

async function main() {
  const apply = process.argv.includes('--apply');

  // 1) 제외(중복) 집합: 기존 keywords + articles + output/ 발행대기
  const [kw, arts] = await Promise.all([
    supabaseSelect('keywords', { columns: 'keyword' }),
    supabaseSelect('articles', { columns: 'person_name' }),
  ]);
  const excluded = new Set();
  for (const k of kw || []) excluded.add(norm(k.keyword));
  for (const a of arts || []) excluded.add(norm(a.person_name));
  collectOutputNames('output', excluded);

  // 2) 전수 크롤링
  const people = await crawlAll(fetchPage);
  if (people.length === 0) {
    console.error('전체 수집 0건 — 사이트 마크업이 변경되었을 수 있습니다.');
    process.exit(1);
  }

  // 3) 중복 판정 → 신규만
  const newRows = [];
  const dupNames = [];
  const seenThisRun = new Set();
  for (const p of people) {
    const nn = norm(p.name);
    if (isDuplicate(p.name, excluded) || isDuplicate(p.name, seenThisRun)) { dupNames.push(p.name); continue; }
    seenThisRun.add(nn);
    newRows.push(buildRow(p));
  }

  // 4) 리포트
  console.log('\n=== hooh 크롤 결과 ===');
  console.log(`전체 수집 ${people.length} / 신규 ${newRows.length} / 중복(스킵) ${dupNames.length}\n`);
  console.log(`■ 강연자/mih_speaker (${newRows.length})`);
  newRows.forEach((r, i) => console.log(`  ${i + 1}. ${r.keyword}  — ${r.notes}`));

  if (!apply) {
    console.log('\n실제 추가하려면 --apply 로 재실행하세요.');
    return;
  }

  // 5) upsert (청크 200, id 멱등)
  let inserted = 0;
  const total = newRows.length;
  for (let i = 0; i < total; i += 200) {
    const chunk = newRows.slice(i, i + 200);
    try {
      await supabaseUpsert('keywords', chunk, { onConflict: 'id' });
    } catch (e) {
      console.error(`upsert 실패: ${inserted}/${total}건까지 반영됨. 청크 ${i}~${i + chunk.length} 실패 — ${e.message}`);
      console.error('id 기준 멱등이므로 그대로 재실행하면 이어서 반영됩니다.');
      throw e;
    }
    inserted += chunk.length;
    console.log(`  upsert 진행 ${inserted}/${total}`);
  }
  console.log(`완료: ${inserted}건 upsert.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: package.json에 스크립트 추가**

`scripts` 블록의 `"crawl:keywords"` 줄 아래에 추가:
```json
    "crawl:hooh": "node scripts/crawl-hooh-keywords.mjs",
```

- [ ] **Step 3: 단위 테스트 회귀 확인**

Run: `npx vitest run tests/crawl-hooh.test.ts tests/crawl-artsro.test.ts`
Expected: PASS (hooh 신규 함수 + artsro 기존 테스트 모두 통과 — 회귀 없음).

- [ ] **Step 4: 실제 dry-run 실행**

Run: `npm run crawl:hooh`
Expected: `=== hooh 크롤 결과 ===` 헤더와 `전체 수집 N / 신규 M / 중복(스킵) K` 요약 출력. 전체 수집이 수백~3천 단위로 0이 아니어야 하고, `--apply` 안내로 끝나며 DB 쓰기 없음.

- [ ] **Step 5: Commit**

```bash
git add scripts/crawl-hooh-keywords.mjs package.json
git commit -m "feat: hooh 크롤러 실행부(fetchPage/main) + crawl:hooh 스크립트"
```

---

### Task 4: 스킬 추가 — crawl-hooh

**Files:**
- Create: `.claude/skills/crawl-hooh/SKILL.md`
- Create: `.agents/skills/crawl-hooh/SKILL.md`

**Interfaces:**
- Consumes: 없음(문서). `npm run crawl:hooh` / `node scripts/crawl-hooh-keywords.mjs --apply` 절차를 안내.

- [ ] **Step 1: SKILL.md 작성**

`.claude/skills/crawl-hooh/SKILL.md` (그리고 동일 내용을 `.agents/skills/crawl-hooh/SKILL.md`에도):
```markdown
---
name: crawl-hooh
description: 호오컨설팅(hooh.kr) 강사 목록을 크롤링해 keywords 테이블과 중복 판정 후 신규 강사만 강연자/mih_speaker로 추가할 때 사용. "hooh 크롤링", "호오컨설팅 강사 수집", "신규 강사 가져와" 요청 시 사용한다. dry-run→사용자 확인→apply 절차를 강제한다.
---

# hooh 강사 키워드 크롤링 절차

hooh.kr에서 신규 강사(키워드)를 수집해 DB에 추가하는 절차. 아래 순서를 TodoWrite 체크리스트로 만들어 하나씩 처리한다.

## 1. dry-run 수집
`npm run crawl:hooh` 를 실행한다. (쓰기 없음)
- `/ajax/teacher_list.asp`를 page=1부터 순회하며 강사를 수집하고, 기존 `keywords` + `articles.person_name` + `output/`과 중복 판정한다.
- 출력: 신규 강사 목록 + `전체 수집 / 신규 / 중복(스킵)` 요약.

## 2. 사용자 확인 (게이트)
신규 목록을 사용자에게 제시하고 **추가해도 되는지 확인을 받는다.** 확인 전에는 절대 `--apply`하지 않는다.

## 3. apply
확인되면 `node scripts/crawl-hooh-keywords.mjs --apply` 를 실행해 신규 행만 upsert한다.
- `id=hooh-{m_idx}` 라 재실행해도 중복 추가되지 않는다(멱등).

## 4. 결과 보고
upsert 건수와, 추가된 강사가 이후 `pick-keywords` 후보 풀(강연자→mih_speaker)에 포함됨을 보고한다.

## 매핑 규칙
- hooh는 강사 섭외 전용 플랫폼 → **전원** `강연자` / `mih_speaker` 고정 (계정 분할 없음).
- `notes` = `직함 | 강의키워드`, `source` = 강사 상세 URL.
```

- [ ] **Step 2: 스킬 인식 확인**

Run: `ls .claude/skills/crawl-hooh/SKILL.md .agents/skills/crawl-hooh/SKILL.md`
Expected: 두 파일 모두 존재.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/crawl-hooh/SKILL.md .agents/skills/crawl-hooh/SKILL.md
git commit -m "feat: crawl-hooh 스킬 추가 (dry-run→확인→apply 게이트)"
```

---

## Self-Review

**Spec coverage:**
- 목록 API/파싱 → Task 1 (parseListPage). ✅
- 페이지네이션/종료조건 → Task 2 (crawlAll). ✅
- 전원 강연자/mih_speaker, notes=직함|키워드, id/source → Task 1 (buildRow) + Global Constraints. ✅
- 중복 판정(keywords+articles+output/) → Task 3 (main). ✅
- dry-run→확인→apply 멱등 upsert → Task 3 (main) + Task 4 (스킬 게이트). ✅
- 전체 0건 방어 → Task 3 (main). ✅
- 병렬 복제(artsro 무수정, 공통함수 import) → Task 1 import 구조. ✅
- 테스트 → Task 1·2. ✅
- npm 스크립트 → Task 3. ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, 명령·기대출력 명시. 누락 없음.

**Type consistency:** `parseListPage`→`{idx,name,title,cate}`가 `buildRow` 입력·`crawlAll` 반환과 일치. `fetchPage(page)` 시그니처가 `crawlAll` 호출부와 일치. `buildRow` 반환 컬럼이 artsro `keywords` 스키마와 동일. ✅
