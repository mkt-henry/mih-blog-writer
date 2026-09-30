---
name: naver-article
description: 네이버 블로그 섭외 원고를 작성·검증·발행할 때 사용. 인물 원고는 mih-researcher→mih-verifier→mih-writer→mih-reviewer 서브에이전트 체인을 순서대로 조정하고, 카테고리 원고는 별도 지침으로 직접 작성·검토한다.
---

# 네이버 섭외 원고 오케스트레이터

이 스킬은 **순서·입출력·상태 전이만 관리한다.** 인물 원고의 자료 수집, 사실 판정,
본문 작성, 검수는 오케스트레이터가 직접 하지 않고 네 역할 서브에이전트에 맡긴다.

Codex 협업 도구의 `task_name`은 하이픈을 허용하지 않으므로 실행 이름은
`mih_researcher`·`mih_verifier`·`mih_writer`·`mih_reviewer`를 사용한다.
사람에게 보이는 역할명과 역할 파일명은 `mih-researcher` 등 기존 이름을 유지한다.

## 0. 분기

먼저 `docs/지침/00_개요.md`를 완전히 읽는다.

- **인물 원고**: 아래 4단계 서브에이전트 체인을 탄다.
- **카테고리 원고**: 이 체인을 타지 않는다. 오케스트레이터가
  `docs/지침/04_카테고리_키워드_원고_작성_지침.md`로 직접 작성하고
  `docs/지침/03_원고_검토_지침.md`로 검토한다.
- 인물·키워드 미지정: `docs/지침/05_랜덤_키워드_셀렉트_지침.md`와
  `node scripts/pick-keywords.mjs <agency>=<n>`으로 후보를 고른다.
- 신규 후보 풀을 보충하는 별도 요청은 `crawl-artsro` 또는 `crawl-hooh` 스킬로 라우팅한다.
- 로그인·동적 렌더링·시각 확인 때문에 실제 브라우저가 필요하면 `aside-browser` 스킬을 사용한다.

## 1. 인물 원고 사전 게이트

작성 전에 반드시 실행한다.

```bash
node scripts/check-keyword.mjs "인물명1" "인물명2"
node scripts/kb.mjs brief --person="<인물명>"
```

- `check-keyword`가 `⛔`를 하나라도 반환하면 해당 인물은 작성하지 않는다.
- `brief`에서 `keyword_id`, `category`, `genre`, `counts.verified`를 확보한다.
- 원고 프레임은 굵은 `category`보다 세부 `genre`를 우선한다.
- `counts.verified >= 10`이어도 수집·검증 생략은 **사용자가 대량 생산을 요청한 경우만** 허용한다.
  생략 사실은 최종 보고에 명시한다.

## 2. 역할 파일과 호출 규칙

오케스트레이터는 각 역할을 호출하기 전에 해당 역할 파일을 직접 읽고, 서브에이전트에게도
그 파일을 완전히 읽으라고 지시한다.

| 단계 | 역할 파일 | Codex task_name |
|---|---|---|
| 수집 | `.agents/agents/mih-researcher.md` | `mih_researcher` |
| 검증 | `.agents/agents/mih-verifier.md` | `mih_verifier` |
| 작성 | `.agents/agents/mih-writer.md` | `mih_writer` |
| 검수 | `.agents/agents/mih-reviewer.md` | `mih_reviewer` |

한 요청에 여러 인물이 있으면 역할별 에이전트 하나에 그 배치 전체를 넘겨도 된다.
각 인물의 상태·산출물·지표는 섞지 말고 별도로 반환하게 한다.

호출 형태:

1. `mih_researcher`를 spawn하고 수집 완료까지 기다린다.
2. 수집 결과가 KB에 적재된 뒤 `mih_verifier`를 spawn한다.
3. 검증 완료 후 `mih_writer`를 spawn한다. 작성자는 반드시 `write-article` 스킬을 읽는다.
4. 작성 완료 후 `mih_reviewer`를 spawn한다.
5. `needs-fix`이면 같은 `mih_writer`에게 `followup_task`로 수정 지시를 전달하고,
   같은 `mih_reviewer`에게 다시 검수시킨다. 수정 라운드는 최대 2회다.

각 단계는 앞 단계의 산출물에 의존하므로 같은 인물의 네 단계를 병렬 실행하지 않는다.
서브에이전트에게는 필요한 입력만 넘기고, 크롤 원문이나 전체 KB를 오케스트레이터 응답으로
되돌려 받지 않는다.

## 3. 단계별 계약

### 수집 — `mih-researcher`

입력: 인물명, `keyword_id`, `category`, `genre`, 발행 계정.

출력:

- 적재한 출처·엔티티·관계·사실·신호 개수
- 이미지 4장 저장 경로 또는 업로드 URL
- 실제 존재가 확인된 유튜브 영상 2개
- 공식 인스타그램 URL
- 적재 거부 목록과 확인하지 못한 항목

수집자는 사실을 `draft`로만 적재하고 판정하지 않는다.

**사전 점검 게이트.** 수집 에이전트는 적재 전에 `feasible: yes|no` 를 먼저 보고한다(공식 SNS·유튜브, 영문명 없는 영상 2개, 이미지 4장, 사실 5건 전망).
`no` 면 그 인물로 진행하지 않고 `pick-keywords` 로 다른 후보를 뽑는다. 교체 후보도 `check-keyword` 중복 검사를 반드시 다시 통과시킨다.

### 검증 — `mih-verifier`

입력: 인물명.

출력: `verified`·`rejected`·`conflict`·보류 개수와 사람이 판단해야 할 conflict 목록.

- 새 사실을 수집하지 않는다.
- `verified < 5`면 근거 부족을 사용자에게 알리고 계속할지 확인한다.
- conflict는 추측으로 해결하지 않는다.

### 작성 — `mih-writer`

입력: 인물명, `keyword_id`, 발행 계정, 이미지 4장, 유튜브 2개, 공식 인스타그램 URL,
재작성이라면 검수 지시.

작성자는 `.agents/skills/write-article/SKILL.md`를 완전히 읽고 따른다.
본문의 인물 사실은 KB의 `verified`만 사용한다.

반환:

- HTML 경로와 제목
- 해시태그 제외 글자수
- 이미지·출처·iframe 개수
- 사용한 KB verified 사실 개수
- `npm run check:article` 결과
- `node scripts/kb.mjs audit`의 `unbacked_years`

### 검수 — `mih-reviewer`

입력: 원고 경로, 인물명.

출력: `pass` 또는 `needs-fix`, 고정 issue 코드와 위치별 수정 지시.

검수자는 원고를 직접 고치지 않는다. 수정은 작성자에게 되돌린다.

## 4. 실행 기록

기록은 오케스트레이터만 남긴다. 각 단계 직전에 `run-put`으로 시작하고 결과를 받은 직후 닫는다.

```powershell
$kbRunStart = @'
{ "person": "<인물명>", "agency": "<agency_slug>", "step": "수집", "agent": "mih-researcher" }
'@
$kbRunStart | node scripts/kb.mjs run-put
```

첫 단계 출력의 `run`과 `step` id를 보존하고 이후 단계에 같은 `run`을 넘긴다.

```powershell
$kbRunDone = @'
{ "step": "<step id>", "status": "done", "metrics": { "sources": 5, "claims": 20 } }
'@
$kbRunDone | node scripts/kb.mjs run-put
```

마지막 검수 단계에는 `"last": true`를 넣는다. 체인이 중단되면 마지막 열린 단계를
`status: "failed"`와 중단 사유로 닫는다.

고정 metrics 키:

| 단계 | 키 |
|---|---|
| 수집 | `entities` `claims` `sources` `signals` `rejected` |
| 검증 | `verified` `rejected` `conflict` `pending` |
| 작성 | `chars` `images` `iframes` `kbClaimsUsed` |
| 검수 | `result` `issues` |

## 5. 발행

인물 원고는 다음을 모두 만족한 뒤에만 Supabase에 등록한다.

- `mih-reviewer` 결과 `pass`
- `npm run check:article "<html-path>"` 하드 실패 0건
- `kb.mjs audit`의 미근거 연도 해결

카테고리 원고에는 인물용 reviewer와 KB audit를 요구하지 않는다.
`docs/지침/04_카테고리_키워드_원고_작성_지침.md` 작성 기준과
`docs/지침/03_원고_검토_지침.md`의 카테고리 항목을 직접 통과한 뒤 등록한다.
현재 `check:article --type category`는 전용 검사를 구현하지 않았으므로 수동 검토를 생략하지 않는다.

```bash
npm run publish "<html-path>" -- --instagram <공식 인스타그램 URL>
```

인물 원고에서 공식 인스타그램 URL을 검증하지 못했으면 값을 지어내지 말고 플래그를 생략한 사실을 보고한다.
카테고리 원고는 인스타그램 플래그를 사용하지 않는다.
이 명령은 모아보기 DB 등록이며 네이버 자동 발행이 아니다.

## 6. 브라우저와 크롤러 라우팅

- 아츠로 신규 인물 수집: `crawl-artsro`
- 호오컨설팅 신규 강사 수집: `crawl-hooh`
- 로그인된 웹사이트, 동적 페이지, 시각 확인: `aside-browser`
- 단순 공개 페이지 조사: 기본 웹 검색·페이지 열기를 우선하고, 그것으로 확인할 수 없을 때 브라우저를 연다.

## 7. 최종 보고

사용자에게 다음만 간결하게 보고한다.

- 제목과 저장 경로
- 발행 계정
- 본문 글자수, 메인 키워드 횟수, 이미지·iframe 수
- 검수 결과와 사용한 KB verified 사실 수
- conflict, 근거 부족, 검증하지 못한 인스타그램 등 사람 판단이 필요한 항목

## 비협상 규칙

- 실제 섭외 후기와 출연료 금액을 만들지 않는다.
- `draft`·`conflict` 사실을 원고 근거로 쓰지 않는다.
- 이미지 4개와 iframe 2개를 확보한다.
- Vercel Blob을 쓰지 않고 업로드 스크립트가 반환한 R2/Supabase URL만 쓴다.
- 하이브 계열 아티스트는 신규 후보로 다루지 않는다.
- 인물 원고는 `mih-reviewer`, 카테고리 원고는 `03_원고_검토_지침.md`의 해당 분기 검토를 통과하기 전 publish하지 않는다.
