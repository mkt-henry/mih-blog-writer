# 원고 작성 지침 준수 강제 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자연어 원고 요청 시 지침 미준수(안 읽음/규칙 위반/검증 없이 완료)를 막는 4층 방어(자동 로드 컨텍스트 + 스킬 + 기계 검증 + 훅)를 구축한다.

**Architecture:** 결정론적 검증 로직을 의존성 없는 ESM 모듈(`scripts/lib/article-checks.mjs`)에 두고 CLI(`scripts/check-article.mjs`)와 vitest 테스트가 공유한다. `CLAUDE.md`로 규칙을 매 세션 자동 로드하고, `.claude/skills/naver-article` 스킬로 절차를 작동화하며, `UserPromptSubmit` 훅으로 진입을 보강한다. 유튜브 규칙은 iframe으로 단일화한다.

**Tech Stack:** Node ESM (no deps), vitest, Claude Code skills/hooks, Markdown.

설계 출처: `docs/superpowers/specs/2026-05-27-naver-article-guideline-enforcement-design.md`

---

## 사전 메모 (실행자 필독)

- 저장소는 `"type": "module"` (package.json). 스크립트는 plain ESM `.mjs`로 작성하고 `node`로 직접 실행된다. TS 트랜스파일러(ts-node) 없음 → 검증 로직은 `.ts`가 아닌 `.mjs`로 둔다.
- 테스트는 `tests/**/*.test.ts` (vitest, `environment: node`). 테스트 파일은 `.ts`지만 `.mjs` 모듈을 import할 수 있다. alias `@` = 저장소 루트.
- 실행 명령: `npm test` (= `vitest run`). 단일 파일: `npx vitest run tests/article-checks.test.ts`.
- 유튜브 규칙은 **iframe 임베드**로 통일한다. 이는 AGENTS.md(202행)·SKILL.md(90행)의 기존 "raw URL (504 우려)" 근거를 사용자 결정에 따라 의도적으로 뒤집는 변경이다. Task 0에서 근거 주석째 교체한다.
- 작업 브랜치: `feat/article-guideline-enforcement` (이미 생성됨, origin/main 기준).

---

## File Structure

- Create: `scripts/lib/article-checks.mjs` — 순수 검증 함수 모음(의존성 없음). 단독 테스트 가능.
- Create: `scripts/check-article.mjs` — CLI 래퍼. 파일 읽기 → 타입 판별 → 검증 함수 호출 → 리포트 출력 → exit code.
- Create: `tests/article-checks.test.ts` — vitest 단위 테스트.
- Create: `CLAUDE.md` — 루트, 자동 로드 진입 규칙 + 비협상 규칙.
- Create: `.claude/skills/naver-article/SKILL.md` — 원고 작성 절차 스킬.
- Create: `.claude/settings.json` — UserPromptSubmit 훅 등록.
- Create: `scripts/hooks/article-reminder.mjs` — 훅 스크립트.
- Modify: `AGENTS.md` — 유튜브 규칙 4개 위치 iframe으로 교체.
- Modify: `SKILL.md` — 6번 유튜브 섹션 iframe으로 교체.
- Modify: `package.json` — `check:article` 스크립트 추가.

---

## Task 0: 유튜브 규칙 iframe으로 단일화

**Files:**
- Modify: `AGENTS.md` (156, 202-207, 357행 및 인접)
- Modify: `SKILL.md` (87-99행)

- [ ] **Step 1: AGENTS.md 본문 구조 8번 수정**

`AGENTS.md`에서 다음을 교체:

```
8. **무대 영상** — 유튜브 URL 항상 정확히 2개 (raw URL, iframe 아님)
```
→
```
8. **무대 영상** — 유튜브 iframe 임베드 항상 정확히 2개
```

- [ ] **Step 2: AGENTS.md 필수 HTML 패턴 유튜브 블록 교체**

`AGENTS.md`에서 다음 블록을:

```html
<!-- 유튜브 — raw URL만 붙이기 (iframe 사용 시 504 케이스 많음) -->
https://www.youtube.com/watch?v=VIDEO_ID_1

<p><br></p>

https://www.youtube.com/watch?v=VIDEO_ID_2
```
→ 다음으로 교체:
```html
<!-- 유튜브 — iframe 임베드 (정확히 2개). raw URL 금지. -->
<iframe width="544" height="306" src="https://www.youtube.com/embed/VIDEO_ID_1" frameborder="0" allowfullscreen></iframe>

<p><br></p>

<iframe width="544" height="306" src="https://www.youtube.com/embed/VIDEO_ID_2" frameborder="0" allowfullscreen></iframe>
```

- [ ] **Step 3: AGENTS.md 발행 전 체크리스트 항목 수정**

```
- [ ] 유튜브 URL 정확히 2개 (raw URL)
```
→
```
- [ ] 유튜브 iframe 임베드 정확히 2개 (raw URL 금지)
```

- [ ] **Step 4: SKILL.md 6번 유튜브 섹션 교체**

`SKILL.md` 87-99행의 설명과 예시를 교체. 설명 문장:

```
네이버 복붙 안정성을 위해 iframe/embed 태그는 쓰지 않고, 실제 존재를 확인한 `watch?v=` 형식의 raw URL만 단독 줄로 배치한다.
```
→
```
실제 존재를 확인한 영상을 iframe 임베드(`youtube.com/embed/<VIDEO_ID>`)로 정확히 2개 배치한다. raw `watch?v=` URL은 쓰지 않는다.
```
그리고 예시의 `https://www.youtube.com/watch?v=VIDEO_ID_1` / `_2` 두 줄을 Step 2의 iframe 스니펫으로 교체.

- [ ] **Step 5: 커밋**

```bash
git add AGENTS.md SKILL.md
git commit -m "docs: 유튜브 규칙을 iframe 임베드로 단일화 (raw URL 금지)"
```

---

## Task 1: article-checks.mjs — 이미지/출처/유튜브 검증

**Files:**
- Create: `scripts/lib/article-checks.mjs`
- Test: `tests/article-checks.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/article-checks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  countBodyImages,
  countSourceCaptions,
  countYoutubeIframes,
  countRawYoutubeUrls,
} from '@/scripts/lib/article-checks.mjs';

const IMG = (src: string) => `<p align="center"><img src="${src}" width="544"></p>`;

describe('countBodyImages', () => {
  it('counts article images, excludes business-card/agency-card', () => {
    const html =
      IMG('https://x/article-images/iu/img1.jpg') +
      IMG('https://x/article-images/iu/img2.jpg') +
      IMG('https://x/agency-card-speaker.png');
    expect(countBodyImages(html)).toBe(2);
  });
});

describe('countSourceCaptions', () => {
  it('counts "출처 - ... 공식 SNS|자료" captions', () => {
    const html = '출처 - 아이유 공식 SNS<br>출처 - 아이유 공식 자료';
    expect(countSourceCaptions(html)).toBe(2);
  });
});

describe('countYoutubeIframes', () => {
  it('counts youtube embed iframes', () => {
    const html =
      '<iframe src="https://www.youtube.com/embed/AAA"></iframe>' +
      '<iframe src="https://www.youtube-nocookie.com/embed/BBB"></iframe>';
    expect(countYoutubeIframes(html)).toBe(2);
  });
});

describe('countRawYoutubeUrls', () => {
  it('detects raw watch / youtu.be URLs', () => {
    const html = 'https://www.youtube.com/watch?v=AAA and https://youtu.be/BBB';
    expect(countRawYoutubeUrls(html)).toBe(2);
  });
  it('returns 0 when only embeds present', () => {
    expect(countRawYoutubeUrls('<iframe src="https://www.youtube.com/embed/AAA"></iframe>')).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/article-checks.test.ts`
Expected: FAIL — `Failed to resolve import "@/scripts/lib/article-checks.mjs"`

- [ ] **Step 3: 최소 구현**

`scripts/lib/article-checks.mjs`:

```js
// 원고 HTML 기계 검증 함수 모음 (의존성 없음, 순수 함수).
// CLI(scripts/check-article.mjs)와 vitest 테스트가 공유한다.

export const KAKAO_URL = 'https://open.kakao.com/o/snG6VXti';

// 본문 이미지 개수 — 명함/카카오 이미지는 제외
export function countBodyImages(html) {
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  return imgs.filter((t) => !/agency-card|business-card|kakao/i.test(t)).length;
}

// 이미지 출처 표기 개수 ("출처 - ... 공식 SNS|자료")
export function countSourceCaptions(html) {
  return (html.match(/출처\s*-\s*[^<]*?공식\s*(?:SNS|자료)/g) || []).length;
}

// 유튜브 iframe 임베드 개수
export function countYoutubeIframes(html) {
  return (html.match(/<iframe\b[^>]*\byoutube(?:-nocookie)?\.com\/embed\/[^>]*>/gi) || []).length;
}

// raw 유튜브 URL 개수 (있으면 위반)
export function countRawYoutubeUrls(html) {
  return (html.match(/youtube\.com\/watch\?v=|youtu\.be\//g) || []).length;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/article-checks.test.ts`
Expected: PASS (4 describe 블록 통과)

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/article-checks.mjs tests/article-checks.test.ts
git commit -m "feat(check): article-checks 이미지/출처/유튜브 검증 함수"
```

---

## Task 2: article-checks.mjs — 구조/금지 패턴 검증

**Files:**
- Modify: `scripts/lib/article-checks.mjs`
- Test: `tests/article-checks.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

`tests/article-checks.test.ts` 하단에 추가 (상단 import에 함수 추가):

```ts
import {
  findBareParagraphs,
  tablesMissingFixedLayout,
  hasBrokenImageSrc,
  hasPhotoPlaceholder,
  hasBusinessCardImg,
  kakaoUrlIssues,
  countHashtags,
} from '@/scripts/lib/article-checks.mjs';

const SE_P = '<p class="se-text-paragraph se-text-paragraph-align- " id="SE-1"><span>본문</span></p>';

describe('findBareParagraphs', () => {
  it('flags <p> with text but no se-text-paragraph class', () => {
    const html = SE_P + '<p>그냥 단락</p>';
    expect(findBareParagraphs(html)).toBe(1);
  });
  it('ignores spacers, images, 대제목', () => {
    const html = SE_P + '<p><br></p>' + '<p align="center"><img src="x"></p>' +
      '<p id="SE-h1"><span><b>제목</b></span></p>';
    expect(findBareParagraphs(html)).toBe(0);
  });
});

describe('tablesMissingFixedLayout', () => {
  it('flags tables without table-layout:fixed', () => {
    const html = '<table style="width:100%;"></table><table style="table-layout:fixed;"></table>';
    expect(tablesMissingFixedLayout(html)).toBe(1);
  });
});

describe('hasBrokenImageSrc', () => {
  it('detects data URI and image.png placeholder src', () => {
    expect(hasBrokenImageSrc('<img src="data:image/png;base64,xx">')).toBe(true);
    expect(hasBrokenImageSrc('<img src="image.png">')).toBe(true);
    expect(hasBrokenImageSrc('<img src="https://x/article-images/iu/img1.jpg">')).toBe(false);
  });
});

describe('hasPhotoPlaceholder', () => {
  it('detects 📷 사진 N 삽입 위치 placeholder', () => {
    expect(hasPhotoPlaceholder('📷 사진 1 삽입 위치')).toBe(true);
    expect(hasPhotoPlaceholder('정상 본문')).toBe(false);
  });
});

describe('hasBusinessCardImg', () => {
  it('detects business-card / agency-card img in body', () => {
    expect(hasBusinessCardImg('<img src="https://x/agency-card-speaker.png">')).toBe(true);
    expect(hasBusinessCardImg('<img src="https://x/article-images/iu/img1.jpg">')).toBe(false);
  });
});

describe('kakaoUrlIssues', () => {
  it('flags non-canonical kakao URLs', () => {
    const r = kakaoUrlIssues('https://open.kakao.com/o/snG6VXti https://open.kakao.com/o/WRONG');
    expect(r.count).toBe(2);
    expect(r.bad).toEqual(['https://open.kakao.com/o/WRONG']);
  });
});

describe('countHashtags', () => {
  it('counts # tokens', () => {
    expect(countHashtags('#가수 #섭외 #공연')).toBe(3);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/article-checks.test.ts`
Expected: FAIL — 새 함수 import 해결 실패

- [ ] **Step 3: 구현 추가**

`scripts/lib/article-checks.mjs` 하단에 추가:

```js
// se-text-paragraph 없이 텍스트가 든 bare <p> 개수
export function findBareParagraphs(html) {
  const blocks = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  return blocks.filter((b) => {
    if (/se-text-paragraph/.test(b)) return false;        // 정상 SE 단락
    if (/<img\b/i.test(b)) return false;                   // 이미지 래퍼
    if (/^<p\b[^>]*>\s*(?:<br\s*\/?>)?\s*<\/p>$/i.test(b)) return false; // 빈 줄
    if (/id="SE-h/i.test(b)) return false;                 // 대제목
    const text = b.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    return text.length > 0;
  }).length;
}

// table-layout:fixed 없는 <table> 개수
export function tablesMissingFixedLayout(html) {
  const tables = html.match(/<table\b[^>]*>/gi) || [];
  return tables.filter((t) => !/table-layout\s*:\s*fixed/i.test(t)).length;
}

// data: URI 또는 image.png 류 깨지는 src 존재 여부
export function hasBrokenImageSrc(html) {
  return /<img\b[^>]*\bsrc\s*=\s*["'](?:data:image\/|[^"']*\bimage\.png\b)/i.test(html);
}

// 사진 placeholder 존재 여부
export function hasPhotoPlaceholder(html) {
  return /📷\s*사진\s*\d+\s*삽입\s*위치/.test(html);
}

// 본문 명함 이미지 존재 여부
export function hasBusinessCardImg(html) {
  return /<img\b[^>]*(?:agency-card|business-card)[^>]*>/i.test(html);
}

// 카카오 URL 점검 — { count, bad[] }
export function kakaoUrlIssues(html) {
  const all = html.match(/https:\/\/open\.kakao\.com\/o\/[A-Za-z0-9]+/g) || [];
  const bad = all.filter((u) => u !== KAKAO_URL);
  return { count: all.length, bad };
}

// 해시태그 개수
export function countHashtags(html) {
  return (html.match(/#[^\s#<]+/g) || []).length;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/article-checks.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/article-checks.mjs tests/article-checks.test.ts
git commit -m "feat(check): 구조/금지 패턴 검증 함수 (bare p, table, kakao 등)"
```

---

## Task 3: article-checks.mjs — 제목/분량/키워드 + 집계기

**Files:**
- Modify: `scripts/lib/article-checks.mjs`
- Test: `tests/article-checks.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

```ts
import {
  checkTitle,
  bodyTextLength,
  countKeyword,
  runPersonChecks,
} from '@/scripts/lib/article-checks.mjs';

describe('checkTitle', () => {
  it('accepts [이름 섭외] 30~60자 title', () => {
    const t = '[아이유 섭외] 청량 보이스의 국민 가수, 대학 축제 및 브랜드 행사 섭외';
    expect(checkTitle(t).ok).toBe(true);
  });
  it('rejects title without bracket', () => {
    expect(checkTitle('아이유 섭외 대학 축제').ok).toBe(false);
  });
  it('rejects too-short title', () => {
    expect(checkTitle('[아이유 섭외]').ok).toBe(false);
  });
});

describe('bodyTextLength', () => {
  it('counts non-space chars of stripped text', () => {
    expect(bodyTextLength('<p>가나다 라마</p>')).toBe(5);
  });
});

describe('countKeyword', () => {
  it('counts keyword occurrences', () => {
    expect(countKeyword('아이유 섭외는 좋다. 아이유 섭외 또.', '아이유 섭외')).toBe(2);
  });
});

describe('runPersonChecks', () => {
  it('returns a fail finding when images != 4', () => {
    const html = '<p class="se-text-paragraph"><span>본문</span></p>';
    const findings = runPersonChecks(html, { title: '[아이유 섭외] 청량 보이스의 국민 가수, 대학 축제 섭외 행사' });
    const imgFinding = findings.find((f) => f.id === 'body_images');
    expect(imgFinding.level).toBe('fail');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/article-checks.test.ts`
Expected: FAIL — 새 함수 미정의

- [ ] **Step 3: 구현 추가**

`scripts/lib/article-checks.mjs` 하단에 추가:

```js
// 제목 점검 — [이름 섭외] 대괄호 + 30~60자
export function checkTitle(title) {
  const t = (title || '').trim();
  const hasBracket = /^\[[^\]]*섭외\]/.test(t);
  const len = [...t].length;
  return { ok: hasBracket && len >= 30 && len <= 60, hasBracket, len };
}

// 본문 텍스트 글자수 (태그/공백 제거)
export function bodyTextLength(html) {
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ');
  return text.replace(/\s/g, '').length;
}

// 키워드 등장 횟수
export function countKeyword(html, keyword) {
  if (!keyword) return 0;
  const text = html.replace(/<[^>]+>/g, ' ');
  const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(esc, 'g')) || []).length;
}

// 인물 원고 종합 검증 → findings[] ({ level:'fail'|'warn', id, message })
export function runPersonChecks(html, { title } = {}) {
  const findings = [];
  const fail = (id, message) => findings.push({ level: 'fail', id, message });
  const warn = (id, message) => findings.push({ level: 'warn', id, message });

  const imgs = countBodyImages(html);
  if (imgs !== 4) fail('body_images', `본문 이미지 ${imgs}개 (정확히 4개 필요)`);

  const srcs = countSourceCaptions(html);
  if (srcs !== 4) fail('source_captions', `출처 표기 ${srcs}개 (정확히 4개 필요)`);

  const yt = countYoutubeIframes(html);
  if (yt !== 2) fail('youtube_iframe', `유튜브 iframe ${yt}개 (정확히 2개 필요)`);
  const rawYt = countRawYoutubeUrls(html);
  if (rawYt > 0) fail('youtube_raw', `raw 유튜브 URL ${rawYt}개 발견 (iframe만 허용)`);

  const bareP = findBareParagraphs(html);
  if (bareP > 0) fail('bare_paragraph', `se-text-paragraph 없는 본문 <p> ${bareP}개`);

  const badTables = tablesMissingFixedLayout(html);
  if (badTables > 0) fail('table_layout', `table-layout:fixed 없는 <table> ${badTables}개`);

  if (hasBrokenImageSrc(html)) fail('broken_src', 'data: 또는 image.png 류 깨지는 img src 발견');
  if (hasPhotoPlaceholder(html)) fail('placeholder', '📷 사진 삽입 위치 placeholder 발견');
  if (hasBusinessCardImg(html)) fail('business_card', '본문에 명함 이미지(agency-card) 발견');

  const kakao = kakaoUrlIssues(html);
  if (kakao.bad.length > 0) fail('kakao_url', `허용되지 않은 카카오 URL: ${kakao.bad.join(', ')}`);

  const tags = countHashtags(html);
  if (tags < 20) fail('hashtags', `해시태그 ${tags}개 (20개 이상 필요)`);

  if (title !== undefined) {
    const tc = checkTitle(title);
    if (!tc.ok) fail('title', `제목 형식/길이 위반 ([이름 섭외] + 30~60자, 현재 ${tc.len}자)`);
  }

  // 경고 (비차단)
  const len = bodyTextLength(html);
  if (len < 2000 || len > 3000) warn('length', `본문 ${len}자 (권장 2,000~3,000)`);

  if (title) {
    const m = title.match(/^\[([^\]]*?)\s*섭외\]/);
    const keyword = m ? `${m[1].trim()} 섭외` : null;
    if (keyword) {
      const n = countKeyword(html, keyword);
      if (n < 10 || n > 20) warn('keyword_density', `메인 키워드 "${keyword}" ${n}회 (권장 10~20)`);
    }
  }

  return findings;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/article-checks.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/article-checks.mjs tests/article-checks.test.ts
git commit -m "feat(check): 제목/분량/키워드 검증 + runPersonChecks 집계기"
```

---

## Task 4: check-article CLI + npm 스크립트

**Files:**
- Create: `scripts/check-article.mjs`
- Modify: `package.json`

- [ ] **Step 1: CLI 작성**

`scripts/check-article.mjs`:

```js
#!/usr/bin/env node
// 원고 HTML 기계 검증 CLI.
//   node scripts/check-article.mjs "<html-path>" [--type person|category]
// 인물 원고는 발행 전 체크리스트의 기계 검증 항목을 확인하고,
// 하드 실패가 1건 이상이면 exit 1.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { runPersonChecks } from './lib/article-checks.mjs';
import { parseArticlePath } from './lib/parse-article-path.js';

const args = process.argv.slice(2);
const typeFlag = (() => {
  const i = args.indexOf('--type');
  return i >= 0 ? args[i + 1] : null;
})();
const pathArg = args.find((a) => !a.startsWith('--') && a !== typeFlag);

if (!pathArg) {
  console.error('사용법: node scripts/check-article.mjs "<html-path>" [--type person|category]');
  process.exit(2);
}
const full = resolve(pathArg);
if (!existsSync(full)) {
  console.error(`파일을 찾지 못함: ${full}`);
  process.exit(2);
}

const html = readFileSync(full, 'utf8');
const parsed = parseArticlePath(pathArg);
const title = parsed?.title;

// 타입 판별: 플래그 우선 → 본문 이미지 있으면 person, 없으면 category
const hasImg = /<img\b/i.test(html);
const type = typeFlag || (hasImg ? 'person' : 'category');

if (type === 'category') {
  console.log(`[check-article] 카테고리 원고로 판별 — 이미지 검사 생략.`);
  console.log(`(카테고리 전용 검증은 04 지침 기반으로 추후 추가 예정)`);
  process.exit(0);
}

const findings = runPersonChecks(html, { title });
const fails = findings.filter((f) => f.level === 'fail');
const warns = findings.filter((f) => f.level === 'warn');

console.log(`\n📋 원고 검증 — ${pathArg}`);
console.log(`타입: 인물 원고 | 제목: ${title ?? '(경로 파싱 실패)'}\n`);

if (fails.length === 0) console.log('✅ 하드 검사 전부 통과');
for (const f of fails) console.log(`❌ ${f.id}: ${f.message}`);
for (const w of warns) console.log(`⚠️  ${w.id}: ${w.message}`);

console.log(`\n요약: 실패 ${fails.length} · 경고 ${warns.length}`);
process.exit(fails.length > 0 ? 1 : 0);
```

- [ ] **Step 2: package.json 스크립트 추가**

`package.json`의 `scripts`에 추가:

```json
"check:article": "node scripts/check-article.mjs",
```

- [ ] **Step 3: 정상 원고로 수동 실행 (정승제 — 교체 완료된 원고)**

정승제 원고는 DB에만 있고 로컬 파일이 없으므로, DB에서 내려받아 임시 검증한다:

```bash
node --input-type=module -e '
import { loadEnv } from "./scripts/lib/env.js";
import { supabaseSelect } from "./scripts/lib/supabase-rest.js";
import { writeFileSync, mkdirSync } from "fs";
loadEnv();
const rows = await supabaseSelect("articles", { columns: "html_content,source_path", filter: "id=eq.1b9ffab4-1cd1-49a3-9b3a-62d3af0510eb" });
mkdirSync("output/2026-05-26/mih_speaker", { recursive: true });
writeFileSync("output/" + rows[0].source_path, rows[0].html_content, "utf8");
console.log("wrote output/" + rows[0].source_path);
'
```
그 후:
```bash
npm run check:article "output/2026-05-26/mih_speaker/정승제_[정승제 섭외] 수포자 910만 명의 수학 교육 전문가, 학부모 특강·교육 동기부여·학교 강연 섭외.html"
```
Expected: 유튜브 항목이 ❌로 나올 수 있음(현재 원고가 raw URL일 경우) — 이는 정상 동작(검출됨)이며, 이미지/출처는 ✅(4/4)여야 한다. 결과를 확인만 하고 임시 파일은 커밋하지 않는다(아래 Step 4에서 정리).

- [ ] **Step 4: 임시 검증 파일 정리**

```bash
rm -rf output/2026-05-26
```
(Step 3에서 임시로 만든 output 파일만 삭제. `git checkout`/`git reset`은 쓰지 말 것 — 커밋 안 된 작업을 날릴 수 있다. `output/`은 추적 대상이 아닐 가능성이 높으니 `git status`로 확인 후, 추적 중이면 `git rm -r --cached output/2026-05-26`로 인덱스에서만 제거.)

- [ ] **Step 5: 커밋**

```bash
git add scripts/check-article.mjs package.json
git commit -m "feat(check): check-article CLI + npm run check:article"
```

---

## Task 5: CLAUDE.md 자동 로드 진입 규칙

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md 작성**

`CLAUDE.md` (루트):

```markdown
# mih-blog-writer

메이드인헤븐 에이전시의 네이버 블로그 섭외 원고 자동 생성·관리 도구 (Next.js + Supabase).
전체 규칙은 `AGENTS.md`, 분기별 작성 지침은 `docs/지침/`, SE3 HTML 패턴은 `SKILL.md`에 있다.

## 원고 작성 진입 규칙 (항상 적용)

원고/섭외 작성 요청을 받으면:

1. **`naver-article` 스킬을 사용한다.**
2. `docs/지침/00_개요.md`로 인물/카테고리 분기를 판단한다.
   - 인물 원고: `01_자료_수집_지침.md` → `02_원고_작성_지침.md` → `03_원고_검토_지침.md`
   - 카테고리 원고: `04_카테고리_키워드_원고_작성_지침.md` → `03_원고_검토_지침.md`
3. 작성 후 **`npm run check:article "<html-path>"` 통과 전에는 publish(`npm run publish`/`npm run upload`)하지 않는다.**

## 비협상 규칙 (자주 깨짐 — 반드시 지킬 것)

- 인물 원고 본문 이미지 `<img>` **정확히 4개** + 출처 표기 4개 (한 세트, 명함 제외)
- 본문 단락은 일반 `<p>` 금지 → **`se-text-paragraph` 클래스 구조 필수**
- 모든 `<table>`에 **`table-layout:fixed`** + 첫 행 `width:%`
- 유튜브는 **iframe 임베드 정확히 2개** (raw URL 금지)
- 카카오 URL은 `https://open.kakao.com/o/snG6VXti` **단일 값만**
- `data:image/...` 데이터 URI 금지, `📷 사진 N 삽입 위치` placeholder 금지

상세는 `AGENTS.md`의 "공통 규칙"·"발행 전 체크리스트" 참조.
```

- [ ] **Step 2: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 추가 — 원고 작성 진입 규칙 자동 로드"
```

---

## Task 6: naver-article 프로젝트 스킬

**Files:**
- Create: `.claude/skills/naver-article/SKILL.md`

- [ ] **Step 1: 스킬 작성**

`.claude/skills/naver-article/SKILL.md`:

```markdown
---
name: naver-article
description: 네이버 블로그 섭외 원고(인물/카테고리)를 작성·검증·발행할 때 사용. "원고 써줘", "섭외 원고", 특정 인물/카테고리 원고 작성 요청 시 반드시 이 스킬을 사용한다. 분기 판단, 자료 수집, SE3 HTML 작성, 이미지 4개 확보, 기계 검증(npm run check:article), publish까지의 전체 절차를 강제한다.
---

# 네이버 섭외 원고 작성 절차

원고 작성 요청을 받으면 아래 순서를 TodoWrite 체크리스트로 만들어 하나씩 처리한다.

## 0. 분기 판단
`docs/지침/00_개요.md`를 읽고 인물 원고인지 카테고리 키워드 원고인지 결정한다.
- 강연·강사·스피커 → `mih_speaker`
- 가수·아이돌 → `mih_casting` 또는 `mih_agency` (최근에 덜 쓴 쪽)

## 1. 자료 수집
- 인물: `docs/지침/01_자료_수집_지침.md`를 따른다. WebSearch 5회+ / WebFetch 1회+. 학습 데이터만으로 프로필 작성 금지.
- **이미지 4개 선확보**: 공식 인스타그램에서 수집(`node scripts/collect-instagram-images.js <handle>` — Apify 경로). 수집한 이미지는 Read 도구로 본인·적합성을 눈으로 확인한 뒤 4개 선정. 4개 확보 실패 시 작성 중단하고 사용자에게 보고.
- 카테고리: `docs/지침/04_카테고리_키워드_원고_작성_지침.md` (자료 조사 포함, 이미지는 DB 아티스트 이미지 사용).

## 2. 작성
- 인물: `docs/지침/02_원고_작성_지침.md` + `AGENTS.md` 공통 규칙 + `SKILL.md`(SE3 HTML 패턴).
- `output/YYYY-MM-DD/{agency_slug}/[slug]_[제목].html`로 저장.
- 비협상 규칙: 본문 이미지 4 + 출처 4, `se-text-paragraph` 필수, 모든 table `table-layout:fixed`, 유튜브 iframe 2개, 카카오 단일 URL, data URI/placeholder 금지.
- 문장 끝 `<br><br>` 후처리 스크립트 실행 (AGENTS.md "줄바꿈 규칙").

## 3. 이미지 업로드
- 인물: `node scripts/upload-article-images.js "<html>" <인물이름> <ascii-slug>` 로 외부 이미지를 Vercel Blob에 올리고 src 교체.

## 4. 검토 + 기계 검증 (발행 게이트)
- `docs/지침/03_원고_검토_지침.md`로 검토.
- **`npm run check:article "<html-path>"` 실행 → 하드 실패 0건이어야 한다.** 실패하면 고치고 재실행. 통과 전 publish 금지.

## 5. 발행
- `npm run publish "<html-path>"` (또는 `npm run upload`).
- 인물 원고면 배포 사이트에서 메타(공식 인스타 URL) 등록.

## 6. 리포트
- 글자수, 메인 키워드 등장 횟수를 사용자에게 보고.
```

- [ ] **Step 2: 스킬 인식 확인 (수동)**

새 Claude Code 세션에서 `/naver-article`이 스킬 목록에 보이는지, 또는 "테스트 원고 써줘" 류 요청에 스킬이 매칭되는지 확인. (자동화 불가 — 수동 확인 항목.)

- [ ] **Step 3: 커밋**

```bash
git add .claude/skills/naver-article/SKILL.md
git commit -m "feat(skill): naver-article 원고 작성 절차 스킬"
```

---

## Task 7: UserPromptSubmit 훅

**Files:**
- Create: `scripts/hooks/article-reminder.mjs`
- Create: `.claude/settings.json`

- [ ] **Step 1: 훅 스크립트 작성**

`scripts/hooks/article-reminder.mjs`:

```js
#!/usr/bin/env node
// UserPromptSubmit 훅: 프롬프트에 "원고"/"섭외"가 있으면 워크플로우 리마인더를
// stdout으로 출력한다 (UserPromptSubmit stdout은 컨텍스트에 주입됨).
// 매칭 안 되면 아무것도 출력하지 않는다.

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let prompt = '';
  try { prompt = JSON.parse(raw).prompt ?? ''; } catch { prompt = raw; }

  if (/원고|섭외/.test(prompt)) {
    process.stdout.write(
      '[원고 작성 워크플로우] naver-article 스킬을 사용하세요. ' +
      'docs/지침/00_개요.md로 인물/카테고리 분기를 판단하고, ' +
      '발행 전 반드시 `npm run check:article "<html>"`를 통과시키세요 ' +
      '(이미지 4·출처 4·유튜브 iframe 2·se-text-paragraph·table-layout:fixed 필수).'
    );
  }
  process.exit(0);
});
```

- [ ] **Step 2: 수동 동작 테스트**

```bash
echo '{"prompt":"정승제 원고 써줘"}' | node scripts/hooks/article-reminder.mjs
```
Expected: `[원고 작성 워크플로우] ...` 출력

```bash
echo '{"prompt":"빌드가 깨졌어"}' | node scripts/hooks/article-reminder.mjs
```
Expected: 출력 없음

- [ ] **Step 3: settings.json 작성**

`.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/hooks/article-reminder.mjs"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: 커밋**

```bash
git add scripts/hooks/article-reminder.mjs .claude/settings.json
git commit -m "feat(hook): UserPromptSubmit 원고 워크플로우 리마인더"
```

---

## Task 8: 전체 테스트 + 마무리

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트 실행**

Run: `npm test`
Expected: 기존 테스트 + `article-checks.test.ts` 모두 PASS

- [ ] **Step 2: lint/build 영향 없음 확인 (선택)**

Run: `npm run build`
Expected: 성공 (새 파일은 .mjs/.md/.json이라 Next 빌드에 영향 없음). 시간이 오래 걸리면 생략 가능.

- [ ] **Step 3: 변경 요약 검토**

Run: `git log --oneline origin/main..HEAD`
Expected: Task 0~7의 커밋이 순서대로 보임.

---

## Self-Review 결과 (작성자 점검)

- **Spec 커버리지:** 구성 0(Task 0)·1(Task 5)·2(Task 6)·3(Task 1~4)·4(Task 7) 모두 태스크로 매핑됨. 테스트 전략은 Task 1~4 TDD + Task 7 수동 테스트 + Task 8 전체 실행으로 커버.
- **Placeholder:** 카테고리 검증은 spec에서 "추후 확정"으로 명시한 의도적 범위 축소 — CLI는 카테고리를 안전하게 skip(exit 0)하도록 구현해 미구현이 차단을 일으키지 않음.
- **타입 일관성:** `runPersonChecks` findings `{level,id,message}` 구조가 CLI에서 동일하게 소비됨. 함수명(`countBodyImages` 등)이 Task 간 일치.
- **알려진 한계:** `findBareParagraphs`·`hasBrokenImageSrc` 등 정규식은 실행 시 TDD로 검증/보정. 스킬 자동 호출·CLAUDE.md 적용은 수동 확인 항목.
