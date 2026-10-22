---
name: naver-schedule-publish
description: 발행 대기 원고를 Aside 브라우저로 네이버 블로그 4계정에 올리고, 대표 이미지 교체·예약 발행·원고 관리 체크·예약 목록 캡처 AIStudio 알림·Discord 전송까지 할 때 사용. "원고 배포", "예약 발행 걸어줘", "블로그에 올려줘", "발행 세팅", "발행까지 해줘" 요청 시 사용한다. 원고 작성(naver-article)이 끝난 뒤 단계다.
---

# 네이버 블로그 예약 발행 (Aside 브라우저)

원고 관리 페이지의 발행 대기 원고(계정당 3개)를 네이버 글쓰기에 붙여넣고 예약 발행까지 건 뒤,
예약 목록 캡처를 AIStudio 알림(Owner 휴대폰 푸시 + 알림함)으로 보낸다
(2026-10-06 Owner 요청으로 Discord "신규 원고 알림" 채널에도 같이 보냈으나, 2026-10-22 Owner 지시로 MIH Discord 알림을 모두 껐다.
`.env.local` 에 `DISCORD_NEW_ARTICLE_WEBHOOK_URL` 이 없어 `send-aistudio.mjs` 는 Discord 를 건너뛴다 — 정상이다. 다시 켤 때 값은 No.VI 금고 `mih-discord-new-article-webhook`). 전 과정은 `scripts/run.sh` 하나로 돈다. 브라우저 작업은 aside-browser 스킬 규칙을 따른다.

## 0. 권한 경계

- **스킬 호출 = 끝까지.** sessions → prepare → publish → report → AIStudio 알림·Discord 전송을 묻지 않고 이어서 한다
  (2026-10-01 사용자 지정: "발행까지 하고 캡처본 발송까지 스킬 범위로", 2026-10-05 Discord → AIStudio, 2026-10-06 Discord 병행).
  사용자가 "세팅만"·"prepare 까지만"처럼 범위를 줄였을 때만 거기서 멈춘다.
- publish 는 prepare 결과에 `err` 가 없을 때만 넘어간다. 남으면 그 원고를 고친 뒤 진행한다.
- **전송은 캡처를 눈으로 확인한 뒤.** `send-aistudio.mjs` 한 번이 두 곳에 따로 보낸다(한쪽이 실패해도 다른 쪽은 간다):
  - AIStudio: `.env.local` 의 `AISTUDIO_NOTIFY_TOKEN`(AIStudio 토큰 label `mih-windows`)으로 MIH 프로젝트 알림. 사진은 알림 하나에 3장까지라 4장이면 `(1/2)`·`(2/2)` 두 알림으로 나뉘고 푸시는 첫 알림만 간다.
  - Discord "신규 원고 알림" 채널: `.env.local` 의 `DISCORD_NEW_ARTICLE_WEBHOOK_URL`. 예전 send-discord.mjs 처럼 메시지 하나에 캡처 4장을 붙인다. 이 줄을 지우면 Discord 만 꺼진다.
  - 한쪽만 다시 보낼 때 `--discord-only` / `--no-discord`, 보내지 않고 설정만 확인할 때 `--check`.

## 1. 계정 ↔ Aside 프로필

`uN` = `Profile N`(프로필 이름은 `%LOCALAPPDATA%/Aside/User Data/Local State` 의 `profile.info_cache.*.name`).

| 계정 | 프로필 | 원고 관리 | blogId |
|---|---|---|---|
| mih_agency | `u4` | https://mih.bp-studio.com/mih_agency | `mih_agency` |
| mih_casting | `u5` | https://mih.bp-studio.com/mih_casting | `mih_casting` |
| influence | `u6` | https://mih.bp-studio.com/mih_speaker | `gdfdhzgfgfhgdj` |
| other | `u7` | https://mih.bp-studio.com/mih_other | `kyh620303` |

u0~u3 은 개인·회사 프로필 — 쓰지 않는다. 글쓰기 URL `https://blog.naver.com/PostWriteForm.naver?blogId=<blogId>&Redirect=Write`.

## 2. 예약 규칙

- 원고 관리 페이지에 **보이는 순서대로** 계정별 시각 3개에 건다. 편수는 계정당 3편 그대로다.
- 시각은 `run.sh` 가 계정·날짜마다 정한다(`bash $K/run.sh times [YYYY-MM-DD]` 로 미리 본다). 에이전시·인플루언스·캐스팅은 첫 글 07:00~09:00, 글 사이 40~80분(10분 단위)으로 모두 오전(늦어도 11:40)에 끝난다(Owner 10-19: 오전에만). 기타는 08:00 · 08:30 · 09:00 고정.
  네 계정이 매일 같은 시각에 올라가던 때(~10-19) 인플루언스·캐스팅·에이전시 새 글이 검색에서 빠져서 바꿨다. 같은 시각으로 되돌리지 않는다.
- 발행일은 다음날. 자정 넘어 작업하면 당일. `run.sh` 기본값: 06시 전이면 오늘, 아니면 내일. 다르면 날짜를 인자로 준다.

캡처와 세션 입출력은 repo 의 `tmp/naver-schedule-publish/`(git 이 무시)에 남는다. 카드 폴더 안이라 카드 답에 `IMAGE: tmp/naver-schedule-publish/<feed>.png` 로 바로 붙일 수 있다.

## 3. 실행 (repo 루트에서, `K=.claude/skills/naver-schedule-publish/scripts`)

```bash
bash $K/run.sh sessions              # ① run_in_background + timeout 최대. 4계정 지속 세션. 끝날 때까지 죽이지 않는다
bash $K/run.sh prepare [YYYY-MM-DD]  # ② 12편 세팅. 10~15분 → run_in_background 로 돌리고 출력 확인
bash $K/run.sh publish [YYYY-MM-DD]  # ③ 예약 확정 + "발행 예약 완료" 체크
bash $K/run.sh report                # ④ 임시저장 0 확인 + 예약 목록 캡처 4장
node $K/send-aistudio.mjs "📅 <M/D> 예약 발행 완료 — 4계정 × 3편 (시각은 계정별)" "<계정별 시각(run.sh times)·제목·건너뛴 계정 마크다운>" \
  "tmp/naver-schedule-publish/mih_agency.png" …/mih_casting.png …/mih_speaker.png …/mih_other.png   # ⑤ AIStudio + Discord (AIStudio 연결 확인만: 맨 앞에 --test, Discord 로는 안 감)
```

한 계정만 돌릴 때는 각 단계 앞에 `ONLY=<feed>`(예: `ONLY=mih_agency bash $K/run.sh prepare`)를 붙인다.

`sessions` 는 프로필마다 90초까지 응답을 기다리고, `Aside isn't running` 처럼 **꺼졌다는 응답일 때만** 프로필 창을 띄운다
(시간 초과는 꺼짐이 아니다 — 세션이 뜨는 데 60초까지 걸린다. 켜진 프로필을 다시 띄우면 닫을 수 없는 빈 '새 탭' 창이 쌓인다). 그다음 `tail -f in<N>.txt | aside repl --account u<N>` 파이프를 붙잡는다.
일회성 `aside repl "<code>"` 로 연 탭은 호출이 끝나면 닫히므로 **작성 중 탭은 반드시 지속 세션에서 연다.**

### 원고 하나가 거치는 단계 (`scripts/steps.js`)

1. `stepText` — 새 글쓰기 탭 → "작성 중인 글이 있습니다" 팝업이면 **취소** → 제목 복사·붙여넣기 → 본문 복사 →
   본문 자리(`글감과 함께 나의 일상을 기록해보세요!`) 클릭 후 붙여넣기 → 사진마다 스크롤해 로딩 → 첫 사진 URL 반환.
2. `set-clipboard-image.sh` — 첫 사진을 **이미지 데이터**로 클립보드에 올린다.
3. `stepFinish` — 첫 사진 클릭 → Ctrl+V(네이버에 업로드되며 자동으로 `대표`) → 원래 링크 사진 클릭 → Delete →
   **`저장`** → 발행 패널 → `예약` → 날짜(`setDate`, 달력) → 시·분.
4. `doPublish`(publish 단계) — 예약·날짜·시각이 기대값과 정확히 같을 때만 패널 안 확정 버튼(`tpb*i.publish`)을 누른다.
   성공하면 URL 에 `logNo` 가 붙는다. 그 뒤 `markReserved` 가 원고 관리 페이지에서 **제목이 같은 원고만** 예약 완료 처리.

### 결과 판정

- prepare: 원고마다 `TXT {"title":…,"comps":30~45,"tables":4,"videos":2,"firstImg":"https://img.bp-studio.com/…"}` 와
  `FIN {"img":{"stillOld":false,"rep":true,"caption":"출처 - …"},"date":"YYYY. MM. DD","sched":"전체공개,예약 HH:MM"}`.
  `err` 가 남으면 그 탭(`W[idx]`)을 snapshot 으로 보고 해당 원고만 손으로 다시 돌린다.
- publish: `PUB {"ok":true,"logNo":…}` 12개, `MARK` 에 `… 200` 3개씩. 확인: `<원고 관리 URL>?showHidden=1`,
  공개 전 `m.blog.naver.com/PostView.naver?blogId=<id>&logNo=<번호>` 가 `비공개`면 예약 상태.
- report: 계정마다 `임시저장된 글 보기, 0개`(예약되면 네이버가 임시저장본을 자동 삭제). 남아 있으면 그 목록에서 지운다.
  잘린 캡처 4장을 **Read 로 전부 눈으로 확인**한 뒤 ⑤ 전송. `200 <알림 id> 3` 과 `200 <알림 id> 1` 두 줄(AIStudio, 뒤에 글이 붙으면 붙지 못한 사진 사유)이면 성공(Discord 는 2026-10-22 부터 꺼져 `discord 건너뜀` 이 찍힌다 — 실패 아님).
  실패한 쪽만 `--discord-only`/`--no-discord` 로 다시 보낸다.

### 이미 발행된 글의 대표 이미지 보정

2026-09-30 이전 글은 대표 이미지 없이 나갔다. "어제 글도 대표 이미지 넣어줘" 같은 요청이면:
1. `node $K/recent-posts.mjs <blogId>` — `NO-THUMB` 이고 날짜가 맞는 글의 logNo 를 고른다.
2. 해당 계정 지속 세션에 `steps.js` 를 보낸 뒤 글마다
   `{ console.log('OPEN', JSON.stringify(await openEdit('<blogId>','<logNo>'))) }` → `firstImg` 로
   `set-clipboard-image.sh` → `{ console.log('FIX', JSON.stringify(await fixAndSave('<firstImg>'))) }`.
   `hasRep:true` 면 이미 대표가 있으니 건너뛴다.
3. 수정 화면의 발행 패널엔 `현재` 만 있고, 확정 버튼(`tpb*i.publish`)을 누르면 공개 글이 바로 갱신된다 — 사용자 요청이 있을 때만.
   성공 판정: `FIX {"stillOld":false,"rep":true,…,"saved":true}`, 그리고 `m.blog.naver.com/PostView.naver?blogId=<id>&logNo=<번호>` 의
   `og:image` 가 `blogthumb.pstatic.net` 으로 바뀐다.

## 4. 함정 (실제로 겪은 것)

- **클립보드는 모든 프로필이 공유** → 원고는 반드시 한 번에 하나씩(run.sh 가 순차로 돈다). 다른 작업과 병렬 금지.
- 붙여넣은 본문 사진은 외부 링크라 **대표 이미지가 안 잡힌다** → 첫 사진을 이미지 데이터로 다시 붙이는 3단계가 필수.
- 제목칸에서 Enter 로는 본문으로 안 넘어간다 — 본문은 자리 문구를 클릭해서 붙인다.
- "작성 중인 글" 팝업이 투명 막으로 클릭을 막는다(증상: 제목이 계속 `제목`). **확인**을 누르면 앞 원고가 복원돼 중복된다. 브라우저 재시작 직후엔 5초 넘게 늦게 뜬다.
- 편집기는 화면에 보인 사진만 불러온다(나머지는 회색 자리표시). 찾을 사진이 안 보이면 스크롤 후 재시도(run.sh 가 1회 자동).
- 발행 패널이 열려 있으면 본문 클릭이 실패한다 → 패널 닫고 편집, 다시 열면 예약 값은 유지된다.
- 사진 삭제 버튼은 DOM 클릭이 안 먹는다 → 사진 클릭 후 Delete 키. 인용구 안 문단 클릭은 타임아웃.
- 복사 버튼은 `[data-copy-title]`/`[data-copy-body]` 로 잡는다(누르면 라벨이 "복사됨"으로 바뀐다).
- REPL 은 `const` 가 호출 간에 남는다 → 반복 명령은 `{ }` 블록으로 감싼다(`already declared` 로 조용히 건너뛴 사고).
- **"발행 예약 완료"를 순서대로 클릭하면 안 된다** — 체크한 원고가 빠지면서 다음 대기 원고가 올라와 엉뚱한 게 체크된다.
- **Aside 는 예고 없이 자체 업데이트로 브라우저를 재시작한다**(2026-10-01 00:34, 저장 안 한 12편 유실). 그래서 원고마다 `저장` 한다.
  꺼지면(`Aside isn't running`) `sessions` 를 다시 띄우면 프로필 창도 같이 열린다. 저장본은 네이버 임시저장함에서 불러온다.
- 지속 세션은 백그라운드 최대 2시간이면 강제 종료된다 → prepare 부터 publish 까지 2시간 안에 끝낸다. 넘기면 `sessions` 를 다시 띄우는데, 그 사이 열어 둔 글쓰기 탭은 사라지니 임시저장함에서 불러온다.
- 지속 세션용 in 파일은 띄우기 전에 비운다 — `tail -f` 는 기존 끝 10줄을 다시 실행한다.
- 에이전트 창은 **숨김 창**이라 `page.screenshot()` 이 타임아웃난다 → report 는 `Aside.exe --profile-directory="Profile N" <글쓰기 주소>` 로 **그 프로필의 보이는 창에 새 탭**을 열어 캡처하고
  (열기 전 탭 목록에 없던 글쓰기 탭을 캡처 대상으로 잡는다), 끝나면 페이지 안 `window.close()` 로 그 탭을 닫는다.
  새 창 옵션은 쓰지 않는다 — Aside 는 창을 닫지 못하게 해서 빈 창이 쌓인다(2026-10-13 창 25개). report 는 계정마다 `창 수: 전 -> 후` 를 찍는다.
  캡처는 기기 픽셀이라 125% 화면이면 1.25배 — `crop.ps1` 이 `이미지 폭 / innerWidth` 로 자동 보정한다.
- 태그는 본문 끝 해시태그로 자동 채워진다. 카테고리는 기본값 그대로.

## 5. 보고

계정별 제목 3개·예약 시각 표, 대표 이미지 교체 결과, 발행 여부(확정했는지/탭에 대기 중인지), AIStudio 알림·Discord 전송 여부를 짧게.
report 가 연 캡처용 창은 캡처 직후 스스로 닫고(`캡처 창 닫힘: true`), 지속 세션이 연 탭(대시보드·글쓰기→글 목록)도 `closeTab` 으로 닫는다(`세션 탭 정리: N->0`). report 끝에서 모든 지속 세션에 `exit` 를 보내 `sessions` 가 스스로 끝난다(따로 죽이지 않는다). 세션이 먼저 죽으면 그 탭은 남고 API 로는 못 닫으니 report 는 세션이 살아 있을 때 돈다. false·빈 값이면 그 계정에 창·탭이 남았다고 알린다.
