# mih-blog-writer

메이드인헤븐 에이전시의 네이버 블로그 섭외 원고 자동 생성·관리 도구 (Next.js + Supabase).
전체 규칙은 `AGENTS.md`, 분기별 작성 지침은 `docs/지침/`, SE3 HTML 패턴은 `SKILL.md`에 있다.

## 원고 작성 진입 규칙 (항상 적용)

원고/섭외 작성 요청을 받으면:

1. **`naver-article` 스킬을 사용한다.**
2. `docs/지침/00_개요.md`로 인물/카테고리 분기를 판단한다.
   - **인물 원고는 수집→검증→작성→검수 4단계 서브에이전트 체인**으로 돈다
     (`mih-researcher` → `mih-verifier` → `mih-writer` → `mih-reviewer`).
     스킬이 순서와 실행 기록만 관리하고, 원고 본문은 `mih-writer` 가 쓴다.
     본문의 사실 진술 근거는 `node scripts/kb.mjs brief --person="<인물명>"` 의
     **`verified` 사실만** 쓴다. 작성 지침 자체는 `write-article` 스킬 그대로다.
   - 카테고리 원고: `04_카테고리_키워드_원고_작성_지침.md` → `03_원고_검토_지침.md` (체인을 타지 않는다)
   - **인물·키워드 미지정 요청**이면 기본은 인물 섭외 원고. 스피커 계정은 강연, 그 외는 가수 등 섭외로 구성하고, 이미 발행/발행 대기된 인물·키워드(DB + `output/`)는 제외한다.
   - **`계정별로 N개씩 써줘`처럼 개수만 지정한 요청**은 `05_랜덤_키워드_셀렉트_지침.md`를 따른다. `node scripts/pick-keywords.mjs <agency>=<n>`으로 미작성 후보를 랜덤 추출 → 사용자 확인 → `01→02→03`.
3. **작성 착수 전 중복 검사는 필수다** — 인물이 정해지면(사용자 지정이든 랜덤 추출이든)
   `node scripts/check-keyword.mjs "<인물명>"` 을 돌려 `✅`를 확인한다. `⛔`면 그 인물은 쓰지 않는다.
   (표기 변형 `팬타곤 키노`↔`키노` 까지 잡는다. 현황 감사는 `node scripts/diag-keyword-dupe.mjs`)
4. 작성 후 **`npm run check:article "<html-path>"` 통과 전에는 publish(`npm run publish`/`npm run upload`)하지 않는다.**
5. `npm run publish` 는 발행 직전에 중복을 한 번 더 막는다(같은 인물 원고가 이미 있으면 거부).
   3번을 건너뛰어도 여기서 걸리지만, 원고를 다 쓰고 나서 막히는 건 낭비다 — 3번은 그대로 지킨다.
   의도적으로 같은 인물을 다시 발행할 때만 `--force` 를 붙인다.

## 비협상 규칙 (자주 깨짐 — 반드시 지킬 것)

- **인물명 반복 14회 이하** (18회 경고 / 22회 발행 불가) — 노출 여부를 가르는 최강 신호.
  이름 대신 `이 아티스트`·`가수`·`무대` 같은 지시어로 받는다.
- **제목·본문에 영문명 금지 (병기도 금지)** — `DJ PLUMM(플럼)`·`플럼(DJ PLUMM)` 둘 다 발행 불가.
  한글 독음 하나로만 쓴다. 통용 한글 표기가 없는 이름(`SF9`, `2PM`, `10CM`, `NCT`, `god`)만 예외.
  근거는 `docs/지침/02_원고_작성_지침.md`
- 인물 원고 본문 이미지 `<img>` **정확히 4개** + 출처 표기 4개 (한 세트, 명함 제외)
- 이미지 호스팅은 **Supabase Storage 버킷(`article-images`)만** — Vercel Blob URL 금지
- 본문 단락은 일반 `<p>` 금지 → **`se-text-paragraph` 클래스 구조 필수**
- 모든 `<table>`에 **`table-layout:fixed`** + 첫 행 `width:%`
- 유튜브는 **iframe 임베드 정확히 2개** (raw URL 금지)
- 카카오 URL은 `https://open.kakao.com/o/snG6VXti` **단일 값만**
- `data:image/...` 데이터 URI 금지, `📷 사진 N 삽입 위치` placeholder 금지

상세는 `AGENTS.md`의 "공통 규칙"·"발행 전 체크리스트" 참조.
