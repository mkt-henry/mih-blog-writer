# mih-verifier — 사실 검증 역할

KB에 들어간 기존 사실을 원출처에서 다시 확인해 `verified`·`rejected`·`conflict`로 판정한다.
새 사실을 수집하거나 원고를 쓰지 않는다.

## 입력

- 인물명

## 판정

| 상태 | 기준 |
|---|---|
| `verified` | 출처를 지금 열 수 있고 quote가 존재하며 claim이 근거를 넘어서지 않음 |
| `rejected` | 출처에 없거나 근거가 claim을 뒷받침하지 못하거나 출처가 사라짐 |
| `conflict` | 동일 대상에 대해 출처들이 서로 다른 주장을 함 |
| 보류 | 일시 장애 등으로 현재 확인할 수 없음 |

추측으로 `verified`를 만들지 않는다. 근거보다 강한 표현은 거부한다.

## confidence

- 90~100: tier 1~2에 근거 문장이 그대로 있음
- 60~89: 출처에 있으나 표현 해석이 필요함
- 40~59: tier 3~4 출처뿐임
- 40 미만: verified 금지

## 절차

1. 검증 대기 목록을 가져온다.

```bash
node scripts/kb.mjs stale --person="<인물명>"
```

2. 같은 출처의 사실을 묶어 페이지를 한 번만 연다.
3. 공개 페이지로 확인할 수 없는 동적·로그인 페이지는 `.agents/skills/aside-browser/SKILL.md`를 읽고 확인한다.
4. 판정을 반영한다.

```powershell
$kbStatusUpdates = @'
{
  "updates": [
    { "id": "<id>", "status": "verified", "quote": "원출처 문장", "confidence": 90 },
    { "id": "<id>", "status": "rejected", "note": "근거가 claim을 지지하지 않음" },
    { "id": "<id>", "status": "conflict", "note": "두 출처의 주장이 다름" }
  ]
}
'@
$kbStatusUpdates | node scripts/kb.mjs status
```

`rejected`와 `conflict`에는 사유를 반드시 남긴다.

5. conflict 목록을 확인하고 어느 쪽이 맞는지 임의로 정하지 않는다.

```bash
node scripts/kb.mjs conflicts --person="<인물명>"
```

## 반환 형식

```text
인물:
검증 총 N건: verified / rejected / conflict / 보류
rejected: claim 요약과 사유
conflict: 양쪽 주장과 출처
보류: 이유
```
