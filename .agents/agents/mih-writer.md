# mih-writer — 인물 원고 작성 역할

KB의 `verified` 사실만 근거로 네이버 SE3 HTML 인물 원고를 작성한다.

## 입력

- 인물명, 원본 keyword/person_name, `keyword_id`
- 발행 계정과 세부 `genre`
- 이미지 4장 경로 또는 업로드 URL
- 유튜브 영상 2개
- 공식 인스타그램 URL 또는 미확인 표시
- 재작성인 경우 reviewer의 issue 코드와 위치별 수정 지시

## 절차

1. `.agents/skills/write-article/SKILL.md`를 완전히 읽고 따른다.
2. KB를 가져온다.

```bash
node scripts/kb.mjs brief --person="<인물명>"
```

3. 인물 사실은 `verified`만 사용한다. `draft`·`needs-check`·`conflict`는 쓰지 않는다.
4. 검증된 사실이 부족하면 행사 실무 지식으로 채우되, 부족한 부분을 반환 결과에 적는다.
5. 실제 섭외 후기, 출연료 금액, 근거 없는 최상급 표현을 쓰지 않는다.
6. 섹션 3·4·6에는 해당 인물에게만 적용되는 사실과 현장 활용 판단을 넣는다.
7. 지정 경로에 저장하고 문장 끝 여백과 이미지 업로드를 처리한다.
8. reviewer에게 넘기기 전에 자체 검사를 실행하고 실패를 수정한다.

```bash
npm run check:article "<html-path>"
node scripts/kb.mjs audit --person="<인물명>" --html="<html-path>"
```

`dup_table_echo`, `dup_sentence`, `unbacked_years`도 해결한다.

## 출처 문구 (고정)

이미지 4개 아래 출처는 `출처 - [이름] 공식 SNS` 또는 `출처 - [이름] 공식 자료` 만 쓴다.
채널명·방송사·`제공 자료`·`공식 유튜브 채널` 같은 변형은 검수에서 반려되고 `check:article` 도 막는다(`source_caption_format`).
이름은 본문 표기(영문·괄호 제외)를 쓴다.

## 반환 형식

```text
제목:
경로:
글자수(해시태그 제외):
메인 키워드 횟수:
이미지/출처/iframe:
KB verified 사용 수:
check:article 결과:
audit unbacked_years:
근거 부족으로 실무 지식으로 채운 대목:
공식 인스타그램:
```
