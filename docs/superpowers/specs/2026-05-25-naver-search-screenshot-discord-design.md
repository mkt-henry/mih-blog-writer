# 네이버 통합검색 노출 스크린샷 → Discord 알림

작성일: 2026-05-25
관련 기존 시스템: `supabase/functions/discord-notify/index.ts` (당일 발행 알림 — 변경 없음)

---

## 1. 배경

매일 10:00 KST에 `discord-notify` Edge Function이 RSS 기반으로 그날(D-0) 발행 현황을 Discord 채널에 알림으로 보내고 있다. 본 작업은 **동일 시각에 별도 Discord 채널로 "전일자(D-1) 발행 키워드의 네이버 통합검색 노출 스크린샷"을 추가 발송**하는 기능을 만든다.

목적은 *내 블로그가 어제 발행한 글이 다음 날 네이버 검색에 실제로 노출되는지를 시각적으로 매일 확인*하는 노출 모니터링이다.

## 2. 요구사항

### 기능 요구
- 매일 10:00 KST에 자동 실행
- 어제(KST 기준) 발행된 articles의 키워드를 수집
- 같은 키워드가 여러 계정에서 발행됐으면 1번만 검색 (중복 제거)
- 각 키워드를 네이버 통합검색에 검색
- **검색 결과 페이지에 내 블로그(`blog.naver.com/mih_speaker | mih_casting | mih_agency`)가 노출된 경우에만** 그 페이지의 첫 화면(viewport) 스크린샷을 Discord 채널에 발송
- 노출되지 않은 키워드는 발송하지 않음 (조용히 skip)

### 비기능 요구
- 기존 `discord-notify`와 **독립** — 한쪽 실패가 다른 쪽 실패로 번지지 않음
- 키워드 N개 처리 시 직렬, 단일 Chromium 인스턴스 재사용 (메모리/콜드스타트 최적)
- 단일 키워드 실패가 전체 실패로 번지지 않음 (errors[]에 기록 후 계속 진행)
- 외부 호출 인증 (`CRON_SECRET`)으로 라우트 보호

### 스코프 밖
- D-0(오늘) 발행 알림 자체의 변경 → 기존 `discord-notify`가 계속 담당
- 노출 결과 히스토리 DB 저장 → 본 작업은 *알림*만 담당, DB persistence는 후속 작업
- 모바일 검색/이미지 탭/VIEW 탭 등 다른 검색면 → PC 통합검색만

## 3. 아키텍처

### 3.1 컴포넌트

```
[Vercel Cron]              vercel.json crons[]
       │                   schedule: "0 1 * * *"   (01:00 UTC = 10:00 KST)
       │                   path:     "/api/cron/naver-search-screenshots"
       ▼
[Vercel Function]          app/api/cron/naver-search-screenshots/route.ts
       │                   runtime: nodejs, maxDuration: 300, memory: 1024
       │                   guard:   Authorization: Bearer ${CRON_SECRET}
       │
       ├─► [Supabase admin]         lib/supabase.ts (재사용)
       │     select title, agency, person_name, published_url
       │     from articles
       │     where publish_date = $1   ($1 = D-1 in KST)
       │
       ├─► [keyword 추출 & dedupe]   lib/naver-search/extract-keyword.ts (추출)
       │                             lib/naver-search/index.ts (Set으로 중복 제거)
       │     /^\[([^\]]+?)(?:\s+섭외)?\]/ 매칭, fallback: person_name
       │
       ├─► [Chromium 단일 인스턴스]   puppeteer-core + @sparticuz/chromium
       │     defaultViewport: 1280×800
       │     args: chromium.args
       │
       │      ┌─ for each 키워드 ──────────────────────────────┐
       │      │ page.goto(search URL, networkidle2, 15s)      │
       │      │ html = await page.content()                   │
       │      │ hit = AGENCY_SLUGS.some(s =>                   │
       │      │   html.includes(`blog.naver.com/${s}`))       │
       │      │ if !hit: page.close(); continue;              │
       │      │ png = await page.screenshot(fullPage:false)    │
       │      │ → Discord webhook multipart 발송              │
       │      │ page.close()                                  │
       │      └────────────────────────────────────────────────┘
       │
       └─► [Discord webhook] lib/naver-search/discord.ts
             POST ${NAVER_SEARCH_DISCORD_WEBHOOK_URL}
             multipart/form-data:
               payload_json = { content: "🔎 <키워드>\n<검색 URL>" }
               files[0]     = screenshot.png (binary)
```

### 3.2 파일 구조

신규:
- `app/api/cron/naver-search-screenshots/route.ts` — Vercel Function. 오케스트레이션만 담당, 비즈니스 로직은 lib으로 분리
- `lib/naver-search/extract-keyword.ts` — title → keyword 추출. discord-notify의 동일 로직을 TS로 재구현 (재사용 불가 — Deno Edge vs Node)
- `lib/naver-search/chromium.ts` — Chromium 부팅 헬퍼 (`launchChromium()`)
- `lib/naver-search/discord.ts` — `postScreenshot(keyword, searchUrl, png)` 함수
- `lib/naver-search/index.ts` — 큰 흐름 함수 `runDailyNaverScreenshotJob()`
- `docs/superpowers/specs/2026-05-25-naver-search-screenshot-discord-design.md` — 본 문서

수정:
- `vercel.json` — `crons[]` 항목 추가
- `package.json` — `puppeteer-core`, `@sparticuz/chromium` 의존성 추가
- 환경변수 — `NAVER_SEARCH_DISCORD_WEBHOOK_URL` 추가 (Vercel Dashboard에서 등록)

### 3.3 의존성 단방향
```
route.ts → lib/naver-search/index.ts → {extract-keyword, chromium, discord}
                                    ↘ lib/supabase.ts (기존)
```
route.ts에는 비즈니스 로직 없음 — 인증·인자 파싱·응답 포맷만.

## 4. 데이터 흐름

### 4.1 입력
- 트리거: Vercel Cron이 정기적으로 GET 호출
- 헤더: `Authorization: Bearer <CRON_SECRET>` (Vercel이 자동 설정)
- KST 어제 날짜 계산: `new Date(Date.now() - 24*3600_000 + 9*3600_000).toISOString().slice(0,10)`

### 4.2 articles 조회
```sql
select title, agency, person_name, published_url
from articles
where publish_date = $1
order by created_at asc
```
- 발행 키워드 = `title`에서 `[XXX 섭외]` 또는 `[XXX]` 패턴 추출. 실패 시 `person_name`을 fallback.
- agency 정보는 노출 판정에는 직접 사용하지 않음 (3개 슬러그 전부를 hit 검사 대상으로 씀 — 카테고리 원고가 다른 계정에 보일 수도 있어 더 안전)

### 4.3 노출 판정
- 검색 URL: `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`
- 페이지 로드 후 `page.content()` HTML 문자열에서 다음 중 하나라도 발견되면 hit:
  - `blog.naver.com/mih_speaker`
  - `blog.naver.com/mih_casting`
  - `blog.naver.com/mih_agency`
- false positive 우려: 매우 낮음 — 키워드+슬러그 조합 매칭이라 우리 글이 노출되어야만 매칭. 광고/별개 결과는 다른 도메인.

### 4.4 Discord 발송
- multipart/form-data
- `payload_json`:
  ```json
  { "content": "🔎 <키워드>\nhttps://search.naver.com/search.naver?query=<encoded>" }
  ```
- `files[0]`: `<키워드>.png` (binary)
- webhook URL은 `NAVER_SEARCH_DISCORD_WEBHOOK_URL` 환경변수에서 읽음

### 4.5 응답
```json
{
  "ok": true,
  "date": "2026-05-24",
  "total": 5,        // D-1 발행 키워드 수 (dedupe 후)
  "posted": 3,       // 노출 hit → Discord 발송 성공
  "skipped": 2,      // 노출 miss
  "errors": []       // 키워드별 실패 메시지
}
```

## 5. 에러 처리 정책

| 상황 | 처리 | HTTP |
|---|---|---|
| `CRON_SECRET` 헤더 누락/불일치 | 즉시 차단 | 401 |
| `NAVER_SEARCH_DISCORD_WEBHOOK_URL` 미설정 | 즉시 차단 | 500 |
| Supabase 조회 실패 | 종료, Vercel Cron 자동 재시도 | 500 |
| Chromium 부팅 실패 | 종료 | 500 |
| 특정 `page.goto` 타임아웃 / 네트워크 오류 | 그 키워드만 skip, errors[]에 기록, 다음 키워드 진행 | 200 (전체로는 성공) |
| Discord webhook 4xx/5xx | 그 키워드만 errors[]에 기록, 다음 키워드 진행 | 200 |
| D-1 발행 0건 | 정상 종료, Discord 발송 없음 | 200 |
| 모든 키워드가 노출 miss | 정상 종료, Discord 발송 없음 | 200 |

## 6. 환경변수

| 이름 | 용도 | 출처 |
|---|---|---|
| `CRON_SECRET` | 라우트 호출 인증 | 신규, Vercel Dashboard에서 등록. Vercel이 cron 호출 시 자동으로 헤더에 실어줌 |
| `NAVER_SEARCH_DISCORD_WEBHOOK_URL` | 스크린샷 발송 채널 webhook | 신규, Vercel Dashboard에서 등록. 채팅으로 노출됐던 URL이므로 **Discord에서 재발급 후 등록 권장** |
| `SUPABASE_URL` | Supabase 엔드포인트 | 기존 재사용 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 | 기존 재사용 |

## 7. 함수 설정 (route segment)

```ts
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
```

`vercel.json` `functions` 설정에서:
```json
{
  "functions": {
    "app/api/cron/naver-search-screenshots/route.ts": { "memory": 1024 }
  },
  "crons": [
    { "path": "/api/cron/naver-search-screenshots", "schedule": "0 1 * * *" }
  ]
}
```

## 8. 검증 계획

### 8.1 Preview 배포에서 수동 트리거
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<preview-deployment>.vercel.app/api/cron/naver-search-screenshots
```

### 8.2 케이스
- ✅ 어제 발행이 있고, 그중 일부가 네이버에 노출됨 → 노출된 것만 Discord에 도착
- ✅ 어제 발행이 있지만 모두 노출 안 됨 → Discord에 아무것도 안 옴, 응답 JSON으로 확인
- ✅ 어제 발행 0건 → Discord에 아무것도 안 옴, 응답 JSON으로 확인
- ✅ 의도적으로 webhook URL을 잘못 설정 → 500 또는 errors[]에 기록 (단계에 따라)

### 8.3 로컬 테스트 한계
`@sparticuz/chromium`은 Lambda 런타임 가정으로 빌드되어 로컬 개발 환경에서 그대로 안 돈다. 로컬에서는 `extract-keyword.ts`의 단위 동작과 `discord.ts`(webhook 호출)만 테스트하고, **브라우저 동작은 Preview 배포에서 검증**한다.

## 9. 기존 시스템과의 관계

- `discord-notify` Edge Function — **변경 없음**. 발행 알림(D-0)을 계속 담당.
- `pg_cron` (`rss_sync_cron_daily` 등) — **변경 없음**.
- 두 알림 채널은 별개의 webhook URL을 사용한다.

## 10. 후속 작업 후보 (이번 스코프 밖)

- 노출 결과(키워드, hit/miss, 검색 시각, 스크린샷 URL)를 Supabase 테이블에 누적 → 노출 추이 대시보드
- 노출 위치(블로그 탭 N번째, VIEW 탭 N번째) 파싱하여 메시지에 포함
- 모바일 검색면(`m.search.naver.com`) 비교
