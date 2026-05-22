# 대시보드 개편 Phase 5 — 스위치 오버 + 정리

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** 신규 UI를 기본 경로(`/`, `/rss`)로 승격시키고, 기존 정적 HTML 기반의 모아보기·키워드·RSS 페이지와 `keywords` 테이블·관련 스크립트를 정리한다. 데이터 drop은 사용자 확인 후 별도 단계.

**Architecture:** 파일 이동(rename) + import 경로 업데이트 + AGENTS.md 갱신. 마지막에 keywords 테이블 drop 마이그레이션은 사용자 명시 승인 후에만 적용.

**관련 스펙:** `docs/superpowers/specs/2026-05-22-dashboard-redesign-design.md` 섹션 11.1 단계 4·5

---

## 사전 준비

- Phase 4 (`feat/dashboard-redesign-phase4-rss`) 위에서 분기
- 작업 브랜치: `feat/dashboard-redesign-phase5-cleanup`
- Phase 1·2·3·4 의 신규 UI 다 동작 확인됨
- 이미 며칠 운영 — keywords_legacy 데이터에 잃으면 안 되는 게 없다고 확신

---

## 파일 변경 요약

| 변경 | 대상 |
|---|---|
| **이동** | `app/dashboard-v2/` → `app/(dashboard)/` (또는 page.tsx만 `app/page.tsx`로) |
| **이동** | `app/rss-v2/` → `app/rss/` (기존 route.ts 폐기) |
| **삭제** | `app/keywords/route.ts` |
| **삭제** | `output/keywords.html`, `output/rss.html` (정적 백업) |
| **삭제** | `components/HomeView.tsx`, `components/ArticleActions.tsx` |
| **삭제** | `app/page.tsx` 기존 (HomeView 사용) → 신규로 교체 |
| **삭제** | `scripts/migrate-keywords-to-db.js` |
| **수정** | `package.json` `migrate` 스크립트에서 keywords 마이그레이션 제거 |
| **수정** | `AGENTS.md` 9단계 (키워드 등록 → 모달 메타 편집) |
| **수정** | `app/(dashboard)/_components/TopBar.tsx` — 키워드 링크 제거, v2 베타 링크 제거 |
| **추가** | `supabase/migrations/<날짜>_drop_keywords.sql` (사용자 승인 후) |

---

## Task 1: 브랜치 분기

- [ ] **Step 1.1**

```bash
git status
git switch -c feat/dashboard-redesign-phase5-cleanup feat/dashboard-redesign-phase4-rss
```

---

## Task 2: `/dashboard-v2` → `/` 스위치 오버

신규 모아보기를 기본 경로로. 기존 HomeView 기반 `app/page.tsx`는 폐기.

**Files:**
- Delete: `app/page.tsx` (기존 HomeView 버전)
- Rename: `app/dashboard-v2/page.tsx` → `app/page.tsx`
- Rename: `app/dashboard-v2/_components/` → `app/_components/`
- Delete: `app/dashboard-v2/` (빈 폴더)
- Delete: `components/HomeView.tsx`

`app/page.tsx`의 import 경로 갱신: `./_components/DashboardClient` 그대로.

- [ ] **Step 2.1: 파일 이동 (git mv)**

```bash
git rm app/page.tsx
git mv app/dashboard-v2/page.tsx app/page.tsx
git mv app/dashboard-v2/_components app/_components
git rm components/HomeView.tsx
rmdir app/dashboard-v2 2>/dev/null || true
```

- [ ] **Step 2.2: import 경로가 깨지지 않는지 확인**

`app/_components/`의 모든 파일이 서로 같은 폴더 안 + `@/lib/...` import만 사용 → 경로 변경 영향 없음. 단 `app/page.tsx` 안의 `./_components/DashboardClient` 경로는 그대로 동작.

`/dashboard-v2`로 가는 외부 링크가 어디 있는지 grep:

```bash
grep -rn "dashboard-v2" app/ components/ lib/ docs/ 2>&1 | head
```

발견되는 곳 (TopBar의 `<Link href="/dashboard-v2">`, ArticleCard 의 onOpen 경로 등) → `/` 로 변경.

특히:
- `app/_components/TopBar.tsx`의 `href="/dashboard-v2"` → `href="/"`
- `app/_components/DashboardClient.tsx`의 `router.push("/dashboard-v2")` (closeModal에서) → `/`
- `app/_components/RangePicker.tsx` (rss-v2가 옮겨오기 전이라 그대로) — 다음 task에서 처리

- [ ] **Step 2.3: 빌드 통과 확인**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 2.4: 커밋**

```bash
git add app/ components/
git commit -m "refactor(switch): /dashboard-v2 → / 스위치 오버, HomeView 폐기

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `/rss-v2` → `/rss` 스위치 오버

기존 정적 HTML 서빙 route 폐기. 신규 페이지로 교체.

**Files:**
- Delete: `app/rss/route.ts` (기존 정적 HTML 서빙)
- Rename: `app/rss-v2/page.tsx` → `app/rss/page.tsx`
- Rename: `app/rss-v2/_components/` → `app/rss/_components/`
- Delete: `app/rss-v2/` (빈 폴더)
- Delete: `output/rss.html` (백업)

- [ ] **Step 3.1: 파일 이동**

```bash
git rm app/rss/route.ts
git mv app/rss-v2/page.tsx app/rss/page.tsx
git mv app/rss-v2/_components app/rss/_components
git rm output/rss.html
rmdir app/rss-v2 2>/dev/null || true
```

- [ ] **Step 3.2: 내부 경로 갱신**

`app/rss/_components/RangePicker.tsx`의 `router.push(`/rss-v2?${...}`)` → `/rss?${...}`.

`grep -rn "rss-v2" app/` 로 추가 발견되는 곳 모두 `/rss`로 변경.

- [ ] **Step 3.3: TopBar 베타 링크 제거**

`app/_components/TopBar.tsx`에서 `<Link href="/rss-v2">v2(베타)</Link>` 줄 제거.

- [ ] **Step 3.4: 빌드 + 커밋**

```bash
npm run build 2>&1 | tail -8
git add app/
git commit -m "refactor(switch): /rss-v2 → /rss 스위치 오버, 정적 HTML 폐기

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `/keywords` 라우트 + 정적 HTML 제거

키워드 페이지는 폐기. 메타 편집은 모달 안에서.

**Files:**
- Delete: `app/keywords/route.ts`
- Delete: `app/api/keywords/route.ts` (있다면)
- Delete: `output/keywords.html`
- Delete: `app/api/manifest.js/route.ts` (keywords.html이 의존했음 — 더 이상 필요 없음)

- [ ] **Step 4.1: 의존성 확인**

```bash
grep -rn "manifest.js\|keywords.html\|/keywords" app/ components/ lib/ scripts/ 2>&1 | head
```

`/keywords` 링크가 남아 있으면 모두 제거 또는 변경. TopBar의 `<Link href="/keywords">` 등.

- [ ] **Step 4.2: 파일 삭제**

```bash
git rm app/keywords/route.ts
git rm app/api/keywords/route.ts 2>/dev/null || true
git rm output/keywords.html
git rm app/api/manifest.js/route.ts
```

- [ ] **Step 4.3: TopBar에서 "키워드" 링크 제거**

`app/_components/TopBar.tsx`에서 `<Link href="/keywords">키워드</Link>` 줄 제거.

- [ ] **Step 4.4: 빌드 + 커밋**

```bash
npm run build 2>&1 | tail -5
git add app/
git commit -m "refactor(switch): /keywords 라우트 + 정적 HTML 제거 (메타는 모달에서)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: legacy 스크립트 + ArticleActions 정리

**Files:**
- Delete: `scripts/migrate-keywords-to-db.js`
- Delete: `components/ArticleActions.tsx` (기존 `/articles/[date]/[agency]/[slug]` 풀페이지에서 쓰던 컴포넌트 — 그 라우트도 함께 검토)
- Modify: `package.json` — `migrate` 스크립트 정리

- [ ] **Step 5.1: 기존 articles dynamic route 확인**

```bash
ls app/articles/ 2>&1
```

`app/articles/[date]/[agency]/[slug]/page.tsx` 가 있을 텐데, 이는 옛 풀페이지. 신규 풀페이지는 `app/article/[id]/`(단수). 옛 풀페이지 사용처가 없으면 폐기.

```bash
grep -rn "articles/\[date\]\|articles/" app/ components/ lib/ 2>&1 | head
```

사용처 없으면:

```bash
git rm -r app/articles/
git rm components/ArticleActions.tsx
```

- [ ] **Step 5.2: migrate-keywords-to-db.js 제거**

```bash
git rm scripts/migrate-keywords-to-db.js
```

- [ ] **Step 5.3: package.json의 migrate 스크립트 정리**

기존:
```json
"migrate": "node scripts/migrate-articles-to-db.js && node scripts/migrate-keywords-to-db.js"
```

다음으로:
```json
"migrate": "node scripts/migrate-articles-to-db.js"
```

또는 articles 마이그레이션도 더 이상 필요 없으면 (1회용이었으니까) 두 줄 모두 제거.

`scripts/migrate-articles-to-db.js` 가 여전히 가치 있는지 확인 — 새 개발자가 production DB로 articles를 옮기는 1회 도구라면 보존. 아니면 함께 제거.

- [ ] **Step 5.4: 빌드 + 커밋**

```bash
npm run build 2>&1 | tail -5
git add app/ components/ scripts/ package.json package-lock.json 2>/dev/null
git commit -m "refactor(cleanup): legacy 풀페이지(articles/[date]/[agency]/[slug])와 ArticleActions, migrate-keywords-to-db 제거

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: AGENTS.md 갱신

기존 워크플로우의 9단계(키워드 DB 등록)를 모달 메타 편집으로 갱신.

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 6.1: 9단계 변경**

기존:
> 9. **키워드 DB 등록** — 인물 원고이면 배포 사이트의 `/keywords`에서 해당 아티스트 키워드를 등록(또는 수정)하고, 공식 인스타그램 URL을 입력한다. 카테고리 원고는 건너뜀.

변경:
> 9. **메타 등록** — 인물 원고이면 배포 사이트(`/`)에서 해당 원고 카드를 클릭해 모달을 열고, 좌측 메타 패널에서 공식 인스타그램 URL을 입력한다. 카테고리/노트는 선택. 카테고리 원고는 건너뜀.

다른 곳에 `/keywords` 또는 keywords 테이블 언급이 있는지 확인:

```bash
grep -n "keywords\|/keywords" AGENTS.md
```

`output/keywords.json` 같은 옛 참조가 남아 있으면 함께 정리.

- [ ] **Step 6.2: 커밋**

```bash
git add AGENTS.md
git commit -m "docs(agents): 9단계를 키워드 DB → 모달 메타 편집으로 갱신

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 검증 + PR (DB drop 제외)

- [ ] **Step 7.1: 회귀**

dev 서버에서 확인:
- `/` → 신규 칸반 (이전 HomeView 화면 사라짐)
- `/rss` → 신규 발행 현황
- `/keywords` → 404 (정상)
- `/article/<id>` → 풀페이지 정상
- `/dashboard-v2`, `/rss-v2` → 404 (정상, 옮겨졌음)
- 카드 클릭 → 모달
- 메타 편집 → 저장 → DB 반영
- 동기화 버튼 동작

- [ ] **Step 7.2: PR 생성**

```bash
git push -u origin feat/dashboard-redesign-phase5-cleanup
gh pr create --base feat/dashboard-redesign-phase4-rss --head feat/dashboard-redesign-phase5-cleanup --title "Phase 5: 스위치 오버 + legacy 정리 (DB drop 제외)" --body "..."
```

PR body:
```
## 요약

신규 UI를 기본 경로로 승격, 옛 정적 HTML 기반 페이지와 legacy 파일 정리. DB drop은 별도 단계.

### 스위치
- /dashboard-v2 → /
- /rss-v2 → /rss
- /keywords 라우트 제거

### 삭제
- components/HomeView.tsx, ArticleActions.tsx
- app/articles/[date]/[agency]/[slug]/ (기존 풀페이지)
- app/api/manifest.js, app/keywords/route.ts
- output/keywords.html, output/rss.html
- scripts/migrate-keywords-to-db.js

### 보존
- /article/[id] 풀페이지
- keywords 테이블 (DB drop은 별도 PR)

### Test
- [x] npm test, npm run build
- [ ] 시각 확인 (수동)
```

---

## Task 8: `keywords` 테이블 drop (별도 PR — 사용자 명시 승인 후)

> ⚠️ **이 단계는 destructive. 사용자가 keywords_legacy 데이터를 확인하고 "drop OK" 명시 후에만 실행.**

**Files:**
- Create: `supabase/migrations/<날짜>_drop_keywords.sql`

- [ ] **Step 8.1: keywords_legacy 잔여 점검 (사용자가 직접)**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{data,count}=await sb.from('keywords_legacy').select('id,keyword,category,instagram,notes,published_url',{count:'exact'}).limit(50);console.log('total:',count);console.log(JSON.stringify(data,null,2));})"
```

사용자가 데이터 검토 후 "drop OK" 라고 명시.

- [ ] **Step 8.2: drop 마이그레이션 작성**

`supabase/migrations/<날짜>_drop_keywords.sql`:

```sql
-- 메타데이터가 articles에 통합된 후 keywords와 백업 테이블 정리.
-- 사전 확인: keywords_legacy의 잔여 데이터를 운영자가 검토 완료.

drop table if exists keywords cascade;
drop table if exists keywords_legacy cascade;
```

- [ ] **Step 8.3: 적용**

```bash
SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"' | tr -d "'") npx supabase db push
```

- [ ] **Step 8.4: 검증 + 커밋 + PR**

```bash
node -e "import('@supabase/supabase-js').then(async({createClient})=>{const r=await import('fs');for(const l of r.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([^#=]+)=[\"']?(.+?)[\"']?\s*$/);if(m)process.env[m[1].trim()]=m[2].trim();}const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const{error}=await sb.from('keywords').select('id',{count:'exact',head:true});console.log('keywords:',error?'gone ✓':'still exists ✗');})"
```

Expected: `gone ✓`.

```bash
git add supabase/migrations/
git commit -m "feat(db): keywords + keywords_legacy 테이블 drop (메타 통합 후 정리)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

별도 PR 생성 또는 phase 5 PR에 추가 커밋.

---

## 완료 기준 (DoD)

- [ ] `/`, `/rss`, `/article/[id]` 정상 동작 (신규 UI)
- [ ] `/keywords`, `/dashboard-v2`, `/rss-v2` 404
- [ ] AGENTS.md 9단계 갱신
- [ ] legacy 파일 모두 제거 (HomeView, ArticleActions, 정적 HTML, migrate-keywords-to-db)
- [ ] 빌드/테스트 모두 통과
- [ ] Phase 5 PR 생성
- [ ] (별도) keywords drop PR 또는 보류

---

## 스코프 밖 / 후속

- `/api/manuscripts/[id]` → `/api/articles/[id]` 통합 (이미 둘 다 존재 — 보존)
- `migrate-articles-to-db.js` 보존 여부 결정 (1회용 도구)
- 모바일 레이아웃 (별도 plan)
- 다국어 (별도 plan)
