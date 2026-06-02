# mih-blog-writer

메이드인헤븐 에이전시의 네이버 블로그 섭외 원고 자동 생성·관리 도구 (Next.js + Supabase).
전체 규칙은 `AGENTS.md`, 분기별 작성 지침은 `docs/지침/`, SE3 HTML 패턴은 `SKILL.md`에 있다.

## 원고 작성 진입 규칙 (항상 적용)

원고/섭외 작성 요청을 받으면:

1. **`naver-article` 스킬을 사용한다.**
2. `docs/지침/00_개요.md`로 인물/카테고리 분기를 판단한다.
   - 인물 원고: `01_자료_수집_지침.md` → `02_원고_작성_지침.md` → `03_원고_검토_지침.md`
   - 카테고리 원고: `04_카테고리_키워드_원고_작성_지침.md` → `03_원고_검토_지침.md`
   - **인물·키워드 미지정 요청**이면 기본은 인물 섭외 원고. 스피커 계정은 강연, 그 외는 가수 등 섭외로 구성하고, 이미 발행/발행 대기된 인물·키워드(DB + `output/`)는 제외한다.
3. 작성 후 **`npm run check:article "<html-path>"` 통과 전에는 publish(`npm run publish`/`npm run upload`)하지 않는다.**

## 비협상 규칙 (자주 깨짐 — 반드시 지킬 것)

- 인물 원고 본문 이미지 `<img>` **정확히 4개** + 출처 표기 4개 (한 세트, 명함 제외)
- 본문 단락은 일반 `<p>` 금지 → **`se-text-paragraph` 클래스 구조 필수**
- 모든 `<table>`에 **`table-layout:fixed`** + 첫 행 `width:%`
- 유튜브는 **iframe 임베드 정확히 2개** (raw URL 금지)
- 카카오 URL은 `https://open.kakao.com/o/snG6VXti` **단일 값만**
- `data:image/...` 데이터 URI 금지, `📷 사진 N 삽입 위치` placeholder 금지

상세는 `AGENTS.md`의 "공통 규칙"·"발행 전 체크리스트" 참조.
