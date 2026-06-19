# hooh.kr 강사 키워드 크롤러 설계

작성일: 2026-06-19
관련 선행 작업: `2026-06-19-artsro-keyword-crawler-design.md` (동일 패턴)

## 목적

강사 섭외 플랫폼 **호오컨설팅(hooh.kr)** 의 강사 목록을 크롤링해, 기존 `keywords` 테이블·`articles`·`output/`과 중복 판정한 뒤 **신규 강사만** `keywords`에 적재한다. artsro 크롤러와 동일한 `dry-run → 사용자 확인 → --apply` 게이트를 강제한다.

## 대상 사이트 분석 (확인 완료)

| 항목 | 값 |
|---|---|
| 목록 API | `POST https://www.hooh.kr/ajax/teacher_list.asp` (form: `page`, `sort=0`) |
| 페이지당 | 20명, 전체 약 **3,499명** (~175페이지) |
| 종료조건 | 목록이 빈 페이지 → `li` 0개 반환 (artsro와 동일) |
| 상세 링크 | `/sub/teacher/next.asp?m_idx={idx}` |
| 인물명 | `div.lname > p` (예: 김창옥) |
| 직함 | `div.lname > span` (예: 김창옥휴먼컴퍼니 대표) |
| 강의키워드 | `p.cate` (예: 동기부여, 열정, 소통…) |

마크업 예시 (한 항목):
```html
<li>
  <a href="/sub/teacher/next.asp?m_idx=6" onclick="hash_form()">
    <div class="img"><img src="/upload/member/2323(8).png" /></div>
    <div class="txt">
      <div class="lname"><p>김창옥</p><span>김창옥휴먼컴퍼니 대표</span></div>
      <p class="cate">동기부여, 열정, 소통, 커뮤니케이션, 힐링, 행복</p>
    </div>
  </a>
</li>
```

## 결정 사항 (사용자 확인 완료)

1. **분류 매핑**: hooh는 강사 섭외 전용 플랫폼 → **전원** `category='강연자'`, `agency='mih_speaker'` 고정. (artsro의 SPEAKER 세트와 동일 규칙, 계정 3분할 없음)
2. **notes 컬럼**: `직함 | 강의키워드` (span + cate를 ` | `로 결합). 둘 중 하나라도 비면 있는 것만.
3. **코드 구조**: artsro 회귀 방지를 위한 **병렬 복제**. 신규 파일만 추가하고 기존 artsro 코드는 손대지 않는다. 공통 순수함수(`norm`/`isDuplicate`/`collectOutputNames`)는 artsro 모듈에서 `import`.

## 아키텍처

### 1) `scripts/crawl-hooh-keywords.mjs` (신규)

artsro 모듈에서 공통 순수함수 재사용 (norm은 내부에서 stripParen 사용):
```js
import { norm, isDuplicate, collectOutputNames } from './crawl-artsro-keywords.mjs';
```

신규 export (테스트 대상, 순수함수):

- **`parseListPage(html)`** → `[{ idx, name, title, cate }]`
  정규식으로 `next.asp?m_idx=(\d+)` → `lname` 내부 `<p>이름</p><span>직함</span>` → `<p class="cate">키워드</p>`를 lazy 매칭. 항목이 없으면 `[]`.
- **`buildRow({ idx, name, title, cate })`** →
  ```js
  {
    id: `hooh-${idx}`,
    keyword: name,
    category: '강연자',
    agency: 'mih_speaker',
    notes: [title, cate].map(s => (s||'').trim()).filter(Boolean).join(' | '),
    source: `https://www.hooh.kr/sub/teacher/next.asp?m_idx=${idx}`,
    is_active: true,
  }
  ```
- **`crawlAll(fetchPage, { maxPage = 300 } = {})`** → 신규 강사 누적
  `page=1`부터 순회. 각 페이지를 `parseListPage`로 파싱:
  - 0개면 종료(마지막 페이지 도달).
  - 이미 본 `idx`만 나오면(신규 0) 종료 — 페이지 clamp 방어.
  - `maxPage` 초과 시 안전 종료(마크업 변경으로 인한 무한루프 방지).

내부 함수(부수효과):

- **`fetchPage(page)`** — `POST /ajax/teacher_list.asp`, body `page=N&sort=0`, `Content-Type: application/x-www-form-urlencoded`. artsro와 동일하게 3회 재시도·백오프·400ms rate limit. 실패 시 빈 문자열 반환(해당 페이지 종료 신호).
- **`main()`**:
  1. 제외 집합 구성 — `keywords.keyword` + `articles.person_name` + `collectOutputNames('output')`.
  2. `crawlAll`로 전수 수집, 같은 실행 내 중복(`seenThisRun`)·제외 집합 중복(`isDuplicate`) 스킵.
  3. **방어**: 전체 수집 0건이면 마크업 변경 의심 → `exit(1)`.
  4. 신규 행 생성 + 리포트(전체 수집 / 신규 / 중복(스킵), 신규 인물 목록).
  5. `--apply` 없으면 dry-run 종료. 있으면 200개 청크로 `supabaseUpsert('keywords', chunk, { onConflict: 'id' })`. `id=hooh-{idx}`라 멱등.

artsro와 달리 `shuffle`/`makeSplitter`/CatNo 순회 **불필요**(전원 고정 agency).

### 2) `package.json`

스크립트 추가: `"crawl:hooh": "node scripts/crawl-hooh-keywords.mjs"`

### 3) 스킬 `.claude/skills/crawl-hooh/SKILL.md` + `.agents/skills/crawl-hooh/SKILL.md`

artsro 스킬과 동일 구조(dry-run → 확인 게이트 → apply → 보고). 매핑 규칙 절만 hooh용으로 교체("전원 강연자/mih_speaker"). description 트리거: "hooh 크롤링", "호오컨설팅 강사 수집".

### 4) 테스트 `tests/crawl-hooh.test.ts`

`crawl-artsro.test.ts` 구조 미러링:
- `parseListPage`: 샘플 2~3개 항목에서 `{idx,name,title,cate}` 추출, 항목 없을 때 `[]`.
- `buildRow`: id/keyword/category/agency/source 고정값, notes 결합 규칙(직함만/키워드만/둘다/둘다없음).
- `crawlAll`: 가짜 `fetchPage`로 (a) 빈 페이지에서 종료, (b) 반복 페이지(clamp) 종료, (c) maxPage 안전 종료.
- `isDuplicate`/`collectOutputNames`: artsro 모듈 import 동작 확인(재export 스모크).

## 데이터 흐름

```
hooh.kr /ajax/teacher_list.asp (page 순회)
  → parseListPage → {idx,name,title,cate}
  → isDuplicate(제외집합: keywords+articles+output/) 스킵
  → buildRow → keywords upsert(onConflict id, 멱등)
  → 이후 pick-keywords 후보 풀에 자동 포함(category=강연자 → mih_speaker 계정)
```

## 에러 처리

- fetch 실패: 3회 백오프 후 빈 문자열 → 해당 페이지에서 종료(부분 수집 보존).
- 전체 0건: 즉시 실패 종료(마크업 변경 알림).
- upsert 실패: 진행 건수 출력 후 throw. `id` 멱등이라 재실행 시 이어서 반영.

## 범위 밖 (YAGNI)

- 상세 페이지(`next.asp`) 진입·이미지/프로필 수집 — 목록 페이지 정보만으로 키워드 적재 충분.
- 강의키워드(cate) 기반 세부 카테고리 분류 — 전원 강연자로 단일화.
- artsro 코드 리팩터링/공통화 — 회귀 방지를 위해 미수행.
