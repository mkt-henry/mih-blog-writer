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
