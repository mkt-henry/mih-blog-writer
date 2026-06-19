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
