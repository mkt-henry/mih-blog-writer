# artsro 키워드 크롤러 + 스킬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** artsro.com 인물 목록을 전체 카테고리 순회로 크롤링해 `keywords` 테이블과 중복 판정 후 신규 인물만 category/agency를 설정해 추가하는 스크립트와, 이를 dry-run→확인→apply 절차로 실행하는 스킬을 만든다.

**Architecture:** 단일 ESM 스크립트 `scripts/crawl-artsro-keywords.mjs`에 순수 함수(파싱·분류·중복판정·행생성)를 export하고, 네트워크/DB I/O는 `main()`에만 둔다. dry-run이 기본이고 `--apply`에서만 upsert한다. 스킬 `crawl-artsro`가 절차를 강제한다.

**Tech Stack:** Node 22 ESM, `fetch`(내장), `scripts/lib/supabase-rest.js`(PostgREST), vitest. 새 의존성 없음.

## Global Constraints

- 새 npm 의존성 추가 금지 — `fetch`와 기존 `scripts/lib/*`만 사용
- DB 접근은 `scripts/lib/supabase-rest.js`의 `supabaseSelect`/`supabaseUpsert`만 사용
- 정규화는 기존 `pick-keywords.mjs`와 동일: `stripParen`(첫 여는 괄호 `(`/`（` 이후 전부 제거) → 공백 제거 → 소문자
- 중복 판정은 양방향 `startsWith`("임용한 박사"↔"임용한")
- 신규 행 `id = "artsro-{GoIdx}"`, upsert는 `on_conflict=id` + `merge-duplicates`
- 3분할 계정은 `["mih_casting","mih_agency","other"]` 라운드로빈
- 강연자 그룹 agency는 `mih_speaker` 고정
- 테스트는 `tests/**/*.test.ts`만 인식됨(vitest.config.ts). 순수 함수만 테스트, 네트워크/DB 호출 금지
- 스크립트는 직접 실행 시에만 `main()` 호출(import 시 부작용 금지): `pathToFileURL` 가드 사용

---

### Task 1: 스크립트 스캐폴드 + 분류 헬퍼

크롤러 파일을 만들고 순수 헬퍼(정규화, 카테고리 맵, `classify`, 3분할 splitter)와 단위 테스트를 작성한다.

**Files:**
- Create: `scripts/crawl-artsro-keywords.mjs`
- Test: `tests/crawl-artsro.test.ts`

**Interfaces:**
- Produces:
  - `stripParen(s: string) => string`
  - `norm(s: string) => string`
  - `classify(catNo: number|string) => { category: string, agency: string|null, split: boolean }`
    - 강연자 그룹 → `{ category:'강연자', agency:'mih_speaker', split:false }`
    - 개그맨 → `{ category:'개그맨', agency:null, split:true }`
    - 방송인 → `{ category:'방송인', agency:null, split:true }`
    - 그 외 모든 CatNo → `{ category:'가수', agency:null, split:true }`
  - `makeSplitter() => () => string` — 호출 시 `mih_casting→mih_agency→other→mih_casting…` 순환
  - `ALL_CAT_NOS: number[]` — 순회 대상 전체 CatNo 배열

- [ ] **Step 1: Write the failing test**

```typescript
// tests/crawl-artsro.test.ts
import { describe, it, expect } from 'vitest';
import {
  stripParen, norm, classify, makeSplitter, ALL_CAT_NOS,
} from '@/scripts/crawl-artsro-keywords.mjs';

describe('norm/stripParen', () => {
  it('strips paren annotations and normalizes', () => {
    expect(stripParen('정재승(카이스트(교수))')).toBe('정재승');
    expect(norm('  송길영  ')).toBe('송길영');
  });
});

describe('classify', () => {
  it('maps speaker group to 강연자/mih_speaker (no split)', () => {
    expect(classify(87)).toEqual({ category: '강연자', agency: 'mih_speaker', split: false });
    expect(classify(96)).toEqual({ category: '강연자', agency: 'mih_speaker', split: false }); // 스포츠
  });
  it('maps 개그맨 / 방송인 with split', () => {
    expect(classify(85)).toEqual({ category: '개그맨', agency: null, split: true });
    expect(classify(89)).toEqual({ category: '방송인', agency: null, split: true });
    expect(classify(114)).toEqual({ category: '방송인', agency: null, split: true });
  });
  it('defaults all other CatNos to 가수 with split', () => {
    expect(classify(74)).toEqual({ category: '가수', agency: null, split: true }); // 아이돌
    expect(classify(40)).toEqual({ category: '가수', agency: null, split: true }); // 댄스
    expect(classify(58)).toEqual({ category: '가수', agency: null, split: true }); // 오케스트라
  });
});

describe('makeSplitter', () => {
  it('round-robins the three entertainer accounts', () => {
    const next = makeSplitter();
    expect([next(), next(), next(), next()]).toEqual(
      ['mih_casting', 'mih_agency', 'other', 'mih_casting'],
    );
  });
});

describe('ALL_CAT_NOS', () => {
  it('includes speaker, gagman, broadcast and performance CatNos', () => {
    for (const n of [87, 85, 89, 74, 40, 58]) expect(ALL_CAT_NOS).toContain(n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crawl-artsro.test.ts`
Expected: FAIL — `Cannot find module '@/scripts/crawl-artsro-keywords.mjs'` (또는 export 없음)

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/crawl-artsro-keywords.mjs
// artsro.com 인물 목록 크롤러 → keywords 테이블 신규 추가 + agency 설정
//
// 사용법:
//   node scripts/crawl-artsro-keywords.mjs           # dry-run (쓰기 없음)
//   node scripts/crawl-artsro-keywords.mjs --apply    # 신규 행 upsert

import { pathToFileURL } from 'node:url';

// ── 정규화 (pick-keywords.mjs와 동일) ───────────────────────────────────────
export const stripParen = (s) => (s || '').replace(/[\(（].*$/s, '').trim();
export const norm = (s) => stripParen(s).replace(/\s+/g, '').toLowerCase();

// ── CatNo → category/agency 매핑 ────────────────────────────────────────────
const SPEAKER = new Set([87, 88, 90, 95, 97, 129, 91, 92, 93, 94, 96]);
const GAGMAN = new Set([85, 86]);
const BROADCAST = new Set([89, 83, 84, 114, 69, 71, 72, 73]);

// 그 외 전부(가수) — 순회 대상 전체 목록. 사이트 네비 트리에서 추출.
const SINGER = [
  74, 75, 76, 77, 78, 79, 80, 81, 82,            // 연예인 가수 세부
  17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31, // 음악
  33, 34, 35, 36, 37, 38, 39, 40,                // 댄스
  41, 42, 43, 44, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, // 퍼포먼스
  58, 59, 60, 61, 103, 104,                      // 클래식
  62, 63, 64, 65, 66, 67, 68,                    // 전통
  107, 108, 109, 110, 111, 112, 133, 113,        // 기획공연
  116, 117, 118, 119, 120,                       // 외국인
];

export const ALL_CAT_NOS = [
  ...SPEAKER, ...GAGMAN, ...BROADCAST, ...SINGER,
];

export function classify(catNo) {
  const n = Number(catNo);
  if (SPEAKER.has(n)) return { category: '강연자', agency: 'mih_speaker', split: false };
  if (GAGMAN.has(n)) return { category: '개그맨', agency: null, split: true };
  if (BROADCAST.has(n)) return { category: '방송인', agency: null, split: true };
  return { category: '가수', agency: null, split: true };
}

const ENT_ACCOUNTS = ['mih_casting', 'mih_agency', 'other'];
export function makeSplitter() {
  let i = 0;
  return () => ENT_ACCOUNTS[i++ % ENT_ACCOUNTS.length];
}

async function main() {
  // Task 5에서 구현
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/crawl-artsro.test.ts`
Expected: PASS (4 describe 블록 통과)

- [ ] **Step 5: Commit**

```bash
git add scripts/crawl-artsro-keywords.mjs tests/crawl-artsro.test.ts
git commit -m "feat: artsro 크롤러 분류 헬퍼(classify/splitter) + 테스트"
```

---

### Task 2: 목록 페이지 파서 `parseListPage`

정적 HTML에서 `{ goIdx, name, desc }`를 추출한다.

**Files:**
- Modify: `scripts/crawl-artsro-keywords.mjs`
- Test: `tests/crawl-artsro.test.ts`

**Interfaces:**
- Produces: `parseListPage(html: string) => Array<{ goIdx: string, name: string, desc: string }>`

실제 마크업(확인됨):
```html
<li><a href="enter_view.html?GoIdx=4778&CatNo=87">
  <div class="idol_img"><img src="..." /></div>
  <div class="idol_tbox">
    <p class="idol_title">이호선</p>
    <p class="idol_txt" style="height:60px;">상담을 통해 세대 간 소통을 이끄는 따뜻한 상담 전문가</p>
  </div>
  </a>
```

- [ ] **Step 1: Write the failing test**

```typescript
// tests/crawl-artsro.test.ts 에 추가
import { parseListPage } from '@/scripts/crawl-artsro-keywords.mjs';

const SAMPLE = `
  <!--li><a href="#idol_pop0"-->
  <li><a href="enter_view.html?GoIdx=4778&CatNo=87">
    <div class="idol_img"><img src="/x.png" /></div>
    <div class="idol_tbox">
      <p class="idol_title">이호선</p>
      <p class="idol_txt" style="height:60px;">따뜻한 상담 전문가</p>
    </div>
    </a>
  </li>
  <li><a href="enter_view.html?GoIdx=3550&CatNo=87">
    <div class="idol_img"><img src="/y.jpg" /></div>
    <div class="idol_tbox">
      <p class="idol_title">임용한 박사</p>
      <p class="idol_txt">통찰력 있는 분석가</p>
    </div>
    </a>
  </li>`;

describe('parseListPage', () => {
  it('extracts goIdx, name, desc per person', () => {
    const rows = parseListPage(SAMPLE);
    expect(rows).toEqual([
      { goIdx: '4778', name: '이호선', desc: '따뜻한 상담 전문가' },
      { goIdx: '3550', name: '임용한 박사', desc: '통찰력 있는 분석가' },
    ]);
  });

  it('returns empty array when no person items', () => {
    expect(parseListPage('<div>no items</div>')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crawl-artsro.test.ts`
Expected: FAIL — `parseListPage is not a function`

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/crawl-artsro-keywords.mjs — classify 아래에 추가
const ITEM_RE =
  /enter_view\.html\?GoIdx=(\d+)[^"]*"[\s\S]*?idol_title">([^<]+)<\/p>[\s\S]*?idol_txt"[^>]*>([^<]*)<\/p>/g;

export function parseListPage(html) {
  const out = [];
  for (const m of (html || '').matchAll(ITEM_RE)) {
    out.push({ goIdx: m[1], name: m[2].trim(), desc: m[3].trim() });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/crawl-artsro.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/crawl-artsro-keywords.mjs tests/crawl-artsro.test.ts
git commit -m "feat: artsro 목록 페이지 파서 parseListPage + 테스트"
```

---

### Task 3: 중복 판정 `isDuplicate` + 행 생성 `buildRow`

**Files:**
- Modify: `scripts/crawl-artsro-keywords.mjs`
- Test: `tests/crawl-artsro.test.ts`

**Interfaces:**
- Produces:
  - `isDuplicate(name: string, excludedSet: Set<string>) => boolean` — 정규화 후 양방향 startsWith
  - `buildRow({ goIdx, name, desc, catNo }, agency: string) => { id, keyword, category, agency, notes, is_active }`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/crawl-artsro.test.ts 에 추가
import { isDuplicate, buildRow } from '@/scripts/crawl-artsro-keywords.mjs';

describe('isDuplicate', () => {
  const excluded = new Set(['송길영', '임용한']);
  it('exact normalized match', () => {
    expect(isDuplicate('송길영', excluded)).toBe(true);
  });
  it('bidirectional startsWith catches title suffix', () => {
    expect(isDuplicate('임용한 박사', excluded)).toBe(true);   // kn="임용한박사" startsWith "임용한"
    expect(isDuplicate('송길영 작가', excluded)).toBe(true);
  });
  it('non-match returns false', () => {
    expect(isDuplicate('홍길동', excluded)).toBe(false);
  });
});

describe('buildRow', () => {
  it('builds keywords row with artsro id + notes source link', () => {
    const row = buildRow(
      { goIdx: '4778', name: '이호선', desc: '따뜻한 상담 전문가', catNo: 87 },
      'mih_speaker',
    );
    expect(row).toEqual({
      id: 'artsro-4778',
      keyword: '이호선',
      category: '강연자',
      agency: 'mih_speaker',
      notes: '따뜻한 상담 전문가 | https://www.artsro.com/right/enter_view.html?GoIdx=4778&CatNo=87',
      is_active: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crawl-artsro.test.ts`
Expected: FAIL — `isDuplicate is not a function`

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/crawl-artsro-keywords.mjs — parseListPage 아래에 추가
export function isDuplicate(name, excludedSet) {
  const kn = norm(name);
  if (!kn) return false;
  if (excludedSet.has(kn)) return true;
  for (const ex of excludedSet) {
    if (!ex) continue;
    if (kn.startsWith(ex) || ex.startsWith(kn)) return true;
  }
  return false;
}

export function buildRow({ goIdx, name, desc, catNo }, agency) {
  const { category } = classify(catNo);
  const url = `https://www.artsro.com/right/enter_view.html?GoIdx=${goIdx}&CatNo=${catNo}`;
  const notes = desc ? `${desc} | ${url}` : url;
  return { id: `artsro-${goIdx}`, keyword: name, category, agency, notes, is_active: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/crawl-artsro.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/crawl-artsro-keywords.mjs tests/crawl-artsro.test.ts
git commit -m "feat: artsro 중복판정 isDuplicate + 행생성 buildRow + 테스트"
```

---

### Task 4: 카테고리 페이지네이션 순회 `crawlCategory` (fetch 주입)

한 CatNo의 모든 페이지를 순회한다. `fetchPage`를 인자로 주입해 네트워크 없이 테스트한다.

**Files:**
- Modify: `scripts/crawl-artsro-keywords.mjs`
- Test: `tests/crawl-artsro.test.ts`

**Interfaces:**
- Produces:
  - `crawlCategory(catNo, fetchPage: (catNo, start) => Promise<string>) => Promise<Array<{goIdx,name,desc}>>`
    - `start`를 0,15,30… 증가시키며 호출
    - 페이지 파싱 결과 0건이면 종료
    - 이미 본 goIdx만 나오면(사이트가 마지막 페이지로 clamp) 종료
    - 중복 goIdx는 제거하고 누적 반환

- [ ] **Step 1: Write the failing test**

```typescript
// tests/crawl-artsro.test.ts 에 추가
import { crawlCategory } from '@/scripts/crawl-artsro-keywords.mjs';

function pageHtml(ids: number[]): string {
  return ids.map((id) =>
    `<li><a href="enter_view.html?GoIdx=${id}&CatNo=99">` +
    `<p class="idol_title">P${id}</p><p class="idol_txt">d${id}</p></a></li>`,
  ).join('');
}

describe('crawlCategory', () => {
  it('paginates until an empty page', async () => {
    const pages: Record<number, number[]> = { 0: [1, 2], 15: [3], 30: [] };
    const fetchPage = async (_cat: number, start: number) => pageHtml(pages[start] ?? []);
    const rows = await crawlCategory(99, fetchPage);
    expect(rows.map((r) => r.goIdx)).toEqual(['1', '2', '3']);
  });

  it('stops when a page repeats already-seen ids (clamped)', async () => {
    const fetchPage = async () => pageHtml([1, 2]); // 항상 같은 페이지
    const rows = await crawlCategory(99, fetchPage);
    expect(rows.map((r) => r.goIdx)).toEqual(['1', '2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crawl-artsro.test.ts`
Expected: FAIL — `crawlCategory is not a function`

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/crawl-artsro-keywords.mjs — buildRow 아래에 추가
const PAGE_SIZE = 15;

export async function crawlCategory(catNo, fetchPage) {
  const acc = [];
  const seen = new Set();
  for (let start = 0; ; start += PAGE_SIZE) {
    const html = await fetchPage(catNo, start);
    const rows = parseListPage(html);
    if (rows.length === 0) break;
    let fresh = 0;
    for (const r of rows) {
      if (seen.has(r.goIdx)) continue;
      seen.add(r.goIdx);
      acc.push(r);
      fresh++;
    }
    if (fresh === 0) break; // 새 항목 없음(clamp된 마지막 페이지) → 종료
  }
  return acc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/crawl-artsro.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/crawl-artsro-keywords.mjs tests/crawl-artsro.test.ts
git commit -m "feat: artsro 카테고리 페이지네이션 순회 crawlCategory + 테스트"
```

---

### Task 5: `main()` 오케스트레이션 + 네트워크/DB + npm 스크립트

전체 CatNo를 순회하고, DB와 중복 비교 후 dry-run 리포트 또는 `--apply` upsert를 수행한다.

**Files:**
- Modify: `scripts/crawl-artsro-keywords.mjs`
- Modify: `package.json` (scripts에 `crawl:keywords` 추가)

**Interfaces:**
- Consumes: `ALL_CAT_NOS`, `classify`, `crawlCategory`, `isDuplicate`, `buildRow`, `makeSplitter`, `norm`
- Consumes: `scripts/lib/supabase-rest.js` → `supabaseSelect(table, {columns})`, `supabaseUpsert(table, rows, {onConflict})`

- [ ] **Step 1: fetchPage + 재시도 헬퍼와 main() 구현**

```javascript
// scripts/crawl-artsro-keywords.mjs 상단 import에 추가
import { supabaseSelect, supabaseUpsert } from './lib/supabase-rest.js';

// crawlCategory 아래에 추가
const BASE = 'https://www.artsro.com/right/enter_list.html';
const UA = 'Mozilla/5.0 (compatible; mih-blog-writer/1.0)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(catNo, start) {
  const url = `${BASE}?CatNo=${catNo}&start=${start}`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await sleep(400); // 예의상 rate limit
      return html;
    } catch (e) {
      lastErr = e;
      await sleep(800 * (attempt + 1)); // 백오프
    }
  }
  console.warn(`  ⚠ fetch 실패(스킵): CatNo=${catNo} start=${start} — ${lastErr?.message}`);
  return ''; // 빈 페이지 → 해당 CatNo 종료 신호
}
```

```javascript
// main() 본문 구현 (기존 빈 main 교체)
async function main() {
  const apply = process.argv.includes('--apply');

  // 1) 기존 DB 키워드/원고 인물명 → 제외(중복) 집합
  const [kw, arts] = await Promise.all([
    supabaseSelect('keywords', { columns: 'keyword' }),
    supabaseSelect('articles', { columns: 'person_name' }),
  ]);
  const excluded = new Set();
  for (const k of kw || []) excluded.add(norm(k.keyword));
  for (const a of arts || []) excluded.add(norm(a.person_name));

  // 2) 전체 CatNo 순회 크롤링
  const splitter = makeSplitter();
  const newRows = [];
  const seenThisRun = new Set(); // 같은 인물이 여러 CatNo에 중복 등장 방지
  let totalCrawled = 0;
  let dup = 0;
  const byBucket = {}; // `${category}/${agency}` → [name]

  for (const catNo of ALL_CAT_NOS) {
    const people = await crawlCategory(catNo, fetchPage);
    totalCrawled += people.length;
    if (people.length === 0) {
      console.warn(`  ⚠ CatNo=${catNo}: 수집 0건`);
      continue;
    }
    const { category, agency: fixedAgency, split } = classify(catNo);
    for (const p of people) {
      const nn = norm(p.name);
      if (isDuplicate(p.name, excluded) || isDuplicate(p.name, seenThisRun)) { dup++; continue; }
      seenThisRun.add(nn);
      const agency = split ? splitter() : fixedAgency;
      newRows.push(buildRow({ ...p, catNo }, agency));
      const bucket = `${category}/${agency}`;
      (byBucket[bucket] ||= []).push(p.name);
    }
    console.log(`  CatNo=${catNo} [${category}] 수집 ${people.length}`);
  }

  // 3) 방어: 전체 0건이면 비정상 → 실패 처리
  if (totalCrawled === 0) {
    console.error('전체 수집 0건 — 사이트 마크업이 변경되었을 수 있습니다.');
    process.exit(1);
  }

  // 4) 리포트
  console.log('\n=== artsro 크롤 결과 ===');
  console.log(`전체 수집 ${totalCrawled} / 신규 ${newRows.length} / 중복(스킵) ${dup}\n`);
  for (const [bucket, names] of Object.entries(byBucket)) {
    console.log(`■ ${bucket} (${names.length})`);
    names.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
    console.log('');
  }

  if (!apply) {
    console.log('실제 추가하려면 --apply 로 재실행하세요.');
    return;
  }

  // 5) upsert (청크 200)
  let inserted = 0;
  for (let i = 0; i < newRows.length; i += 200) {
    const chunk = newRows.slice(i, i + 200);
    await supabaseUpsert('keywords', chunk, { onConflict: 'id' });
    inserted += chunk.length;
  }
  console.log(`완료: ${inserted}건 upsert.`);
}
```

- [ ] **Step 2: npm 스크립트 추가**

`package.json`의 `scripts`에 한 줄 추가 (`collect:images` 아래):

```json
    "crawl:keywords": "node scripts/crawl-artsro-keywords.mjs",
```

- [ ] **Step 3: 단위 테스트 회귀 확인**

Run: `npx vitest run tests/crawl-artsro.test.ts`
Expected: PASS (이전 모든 테스트 그대로 통과 — main 추가는 export에 영향 없음)

- [ ] **Step 4: 실제 dry-run 검증 (네트워크)**

Run: `npm run crawl:keywords`
Expected:
- `CatNo=87 [강연자] 수집 N` 형태 로그가 카테고리별로 출력
- 마지막에 `전체 수집 … / 신규 … / 중복(스킵) …` 요약과 category/agency 버킷별 신규 목록
- `실제 추가하려면 --apply 로 재실행하세요.` 출력
- DB에 쓰기가 일어나지 않음(dry-run)

검증 포인트: 신규 목록의 강연자 인물이 모두 `강연자/mih_speaker` 버킷에, 가수/방송인/개그맨이 3분할 버킷에 들어갔는지 육안 확인.

- [ ] **Step 5: Commit**

```bash
git add scripts/crawl-artsro-keywords.mjs package.json
git commit -m "feat: artsro 크롤러 main() 오케스트레이션 + crawl:keywords 스크립트"
```

---

### Task 6: `crawl-artsro` 스킬 추가

dry-run→확인→apply 절차를 강제하는 스킬을 두 위치에 만든다.

**Files:**
- Create: `.claude/skills/crawl-artsro/SKILL.md`
- Create: `.agents/skills/crawl-artsro/SKILL.md`

**Interfaces:** (문서만, 코드 없음)

- [ ] **Step 1: SKILL.md 작성**

아래 내용을 두 파일에 동일하게 작성한다:

```markdown
---
name: crawl-artsro
description: artsro.com 인물 목록을 크롤링해 keywords 테이블과 중복 판정 후 신규 인물만 category/agency를 설정해 추가할 때 사용. "artsro 크롤링", "키워드 수집", "신규 인물 가져와" 요청 시 사용한다. dry-run→사용자 확인→apply 절차를 강제한다.
---

# artsro 키워드 크롤링 절차

artsro.com에서 신규 인물(키워드)을 수집해 DB에 추가하는 절차. 아래 순서를 TodoWrite 체크리스트로 만들어 하나씩 처리한다.

## 1. dry-run 수집
`npm run crawl:keywords` 를 실행한다. (쓰기 없음)
- 전체 CatNo를 순회하며 인물을 수집하고, 기존 `keywords` + `articles.person_name`과 중복 판정한다.
- 출력: category/agency 버킷별 **신규 인물 목록** + `전체 수집 / 신규 / 중복(스킵)` 요약.

## 2. 사용자 확인 (게이트)
신규 목록을 사용자에게 제시하고 **추가해도 되는지 확인을 받는다.** 확인 전에는 절대 `--apply`하지 않는다.
- 분류가 어색한 항목(예: 공연 단체가 가수로 잡힘)이 있으면 함께 보고한다.

## 3. apply
확인되면 `node scripts/crawl-artsro-keywords.mjs --apply` 를 실행해 신규 행만 upsert한다.
- `id=artsro-{GoIdx}` 라 재실행해도 중복 추가되지 않는다(멱등).

## 4. 결과 보고
upsert 건수와, 추가된 인물이 이후 `pick-keywords` 후보 풀에 포함됨을 보고한다.

## 매핑 규칙 (참고)
- 강연·전문가(명사/전문강사/교수/기업인/종교인/크리에이터/쉐프/헬스/모델/뷰티/스포츠) → `강연자` / `mih_speaker`
- 개그맨 → `개그맨` / 3분할
- 방송인·MC·아나운서 → `방송인` / 3분할
- 그 외 전부(가수 + 모든 공연 단체) → `가수` / 3분할
- 3분할 = `mih_casting`/`mih_agency`/`other` 라운드로빈
```

- [ ] **Step 2: 스킬 인식 확인**

Run: `ls .claude/skills/crawl-artsro/SKILL.md .agents/skills/crawl-artsro/SKILL.md`
Expected: 두 파일 모두 존재

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/crawl-artsro/SKILL.md .agents/skills/crawl-artsro/SKILL.md
git commit -m "feat: crawl-artsro 스킬 추가 (dry-run→확인→apply 게이트)"
```

---

## 자체 리뷰 메모

- **Spec 커버리지**: 크롤링(Task2,4) / 중복판정(Task3) / 신규추가+agency(Task3,5) / 매핑(Task1) / dry-run·apply(Task5) / 스킬(Task6) / 테스트(Task1~4) — 모두 태스크 존재.
- **타입 일관성**: `classify`는 전 태스크에서 `{category, agency, split}` 동일 사용. `buildRow`/`crawlCategory`/`isDuplicate` 시그니처 태스크 간 일치.
- **플레이스홀더 없음**: 모든 코드 스텝에 실제 코드 포함.
- **주의**: Task5의 `main()`은 단위 테스트 대상이 아니며 실제 dry-run(Task5 Step4)으로 검증한다(네트워크 의존).
