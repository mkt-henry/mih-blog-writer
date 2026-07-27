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
- **인물·키워드 미지정 요청**이면 기본은 인물 섭외 원고. 발행 계정 성격(스피커→강연, 그 외→가수 등)에 맞춰 **이미 발행됐거나 발행 대기인 인물·키워드(DB `articles` 전체 + `output/`)를 제외**하고 새 인물을 고른다.

## 0-1. 중복 검사 게이트 (작성 착수 전 필수 — 건너뛰지 않는다)
인물/키워드가 정해지면 **자료 수집을 시작하기 전에** 반드시 실행한다.

```bash
node scripts/check-keyword.mjs "인물명1" "인물명2"
```

- `✅`(종료코드 0)만 작성 대상이다. `⛔`가 나오면 **그 인물은 쓰지 않는다** — 다른 후보로 교체하거나 사용자에게 확인받는다.
- 사용자가 인물을 직접 지정한 경우에도 검사한다(과거 이미 발행한 인물을 다시 지시하는 경우가 실제로 있었다).
- `articles`(person_name + 제목 `[인물명]`) · `output/` 대기 원고 · `keywords.published_url` 을 대조하며, `팬타곤 키노`↔`키노`, `HAON(김하온)`↔`김하온` 같은 표기 변형까지 잡는다.
- 계정별 개수만 지정된 요청은 `node scripts/pick-keywords.mjs <agency>=<n>` 로 후보를 뽑는다(이미 같은 기준으로 걸러 나온다). 제외 사유를 보려면 `--why`.

## 1. 자료 수집
- 인물: `docs/지침/01_자료_수집_지침.md`를 따른다. WebSearch 5회+ / WebFetch 1회+. 학습 데이터만으로 프로필 작성 금지.
- **이미지 4개 선확보**: 공식 인스타그램에서 수집(`node scripts/collect-instagram-images.js <handle>` — Apify 경로). 수집한 이미지는 Read 도구로 본인·적합성을 눈으로 확인한 뒤 4개 선정. 인스타에 본인 단독 사진이 부족하면 **보도자료를 제외한 기타 이미지**(일상·화보·비공식 SNS 등)로 채운다 — 이미지 부족으로 작성을 중단하지 않는다.
- 카테고리: `docs/지침/04_카테고리_키워드_원고_작성_지침.md` (자료 조사 포함, 이미지는 DB 아티스트 이미지 사용).

## 2. 작성
- 인물: **`write-article` 스킬**을 호출한다. SEO 최적화(C-Rank·DIA+·AI브리핑·스니펫), SE3 HTML 구조, LSI 연관어, FAQ, 해시태그, 저장·후처리까지 일괄 지침 제공.
- 카테고리: `docs/지침/04_카테고리_키워드_원고_작성_지침.md` 사용 (변동 없음).
- `output/YYYY-MM-DD/{agency_slug}/[slug]_[제목].html`로 저장.
- 비협상 규칙: 본문 이미지 4 + 출처 4, `se-text-paragraph` 필수, 모든 table `table-layout:fixed`, 유튜브 iframe 2개, 카카오 단일 URL, data URI/placeholder 금지.

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
