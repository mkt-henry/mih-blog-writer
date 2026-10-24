#!/bin/bash
# 네이버 예약 발행 전 과정 드라이버. repo 루트에서 실행한다.
#
#   bash $K/run.sh sessions            # (run_in_background) 4계정 지속 브라우저 세션을 띄우고 붙잡고 있는다
#   bash $K/run.sh prepare [YYYY-MM-DD] # 원고 붙여넣기 → 대표 이미지 교체 → 저장 → 예약 날짜·시각 세팅 (발행 안 함)
#   bash $K/run.sh publish [YYYY-MM-DD] # 예약 확정 → 원고 관리 "발행 예약 완료" 체크
#   bash $K/run.sh report  [YYYY-MM-DD] # 임시저장 0 확인 → 예약 목록 캡처 4장 → (눈으로 확인 후) send-aistudio.mjs 로 AIStudio 알림 + Discord
#
# 날짜 기본값: 지금이 06시 전이면 오늘, 아니면 내일. 시각은 slots() 가 계정·날짜마다 정한다(아래).
# 작업 폴더: $WORK (기본 <repo>/tmp/naver-schedule-publish). 세션 입출력 in<N>.txt / out<N>.txt 가 여기 생긴다.

K="$(cd "$(dirname "$0")" && pwd)"
# 카드 폴더(repo) 안의 tmp/ (git 이 무시한다): 캡처를 카드 답에 IMAGE: 로 바로 붙일 수 있다. $TEMP 는 카드 폴더 밖이라 No.VI 가 붙이지 않는다(2026-10-15).
WORK="${WORK:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)/tmp/naver-schedule-publish}"; mkdir -p "$WORK"
ASIDE_EXE='C:\Program Files\Aside\Application\Aside.exe'
ACCOUNTS=("4 mih_agency mih_agency" "5 mih_casting mih_casting" "6 mih_speaker gdfdhzgfgfhgdj" "7 mih_other kyh620303")
[ -n "$ONLY" ] && { sel=(); for a in "${ACCOUNTS[@]}"; do for o in ${ONLY//,/ }; do [[ " $a " == *" $o "* ]] && sel+=("$a"); done; done; ACCOUNTS=("${sel[@]}"); }   # 계정 한정: ONLY=mih_agency,mih_other bash run.sh <단계>
COUNT="${COUNT:-3}"   # 계정당 편수. 평소엔 3(3편 모인 계정만 건다). 밀린 글을 바로 올릴 때만 COUNT=2 처럼 줄인다
# 사람처럼 (2026-10-24 Owner): 계정 순서를 섞고, 글과 글 사이를 20~90초 들쭉날쭉 쉰다. NOGAP=1 이면 쉬지 않는다
mapfile -t ACCOUNTS < <(printf '%s
' "${ACCOUNTS[@]}" | shuf)
gap() { [ -n "$NOGAP" ] || sleep $(( ${1:-20} + RANDOM % ${2:-70} )); }
# 두 카드가 같은 Aside 프로필·클립보드로 동시에 발행하면 서로 글을 덮는다 → 저장소 밖 잠금 파일로 한 번에 하나만
LOCK="$HOME/.novi/locks/mih-naver-publish.lock"; mkdir -p "$(dirname "$LOCK")"
lock() {
  for i in $(seq 1 240); do
    if [ -f "$LOCK" ]; then read -r lp lt lw < "$LOCK"; age=$(( $(date +%s) - ${lt:-0} ))
      if [ "$lw" != "$(git rev-parse --show-toplevel 2>/dev/null)" ] && [ "$age" -lt 10800 ]; then [ $i = 1 ] && echo "다른 발행이 진행 중($lw) — 끝날 때까지 기다린다"; sleep 30; continue; fi
    fi
    echo "$$ $(date +%s) $(git rev-parse --show-toplevel 2>/dev/null)" > "$LOCK"; return 0
  done; echo "2시간 기다려도 다른 발행이 안 끝났다 — 중단"; exit 1
}
DATE="${2:-$(node -e 'const d=new Date(); if (d.getHours()>=6) d.setDate(d.getDate()+1); console.log(d.toLocaleDateString("sv-SE"))')}"
# 예약 시각 (2026-10-19~): 네 계정이 매일 08:00·08:30·09:00 에 똑같이 올라가 한 사람이 자동으로 돌리는 묶음처럼 보였고,
# 10-08 부터 인플루언스·캐스팅, 10-12 부터 에이전시 새 글이 검색에서 빠졌다(기타만 정상). 편수는 그대로 두고 시각만 흩는다.
# 계정마다 첫 글 시각(07:00~09:00)과 글 사이 간격(40~80분)을 날짜로 정해 모두 오전(늦어도 11:40) 안에 끝낸다(Owner 10-19: 오전에만).
# prepare 와 publish 가 같은 값을 얻어야 해서 무작위가 아니라 날짜·계정 해시다.
# 네이버 예약 분 선택은 10분 단위라 분은 10의 배수. 기타(mih_other)는 계속 정상이라 08:00·08:30·09:00 그대로 둔다.
slots() {  # slots <feed> → "HH MM,HH MM,HH MM"
  [ -n "$SLOTS" ] && { echo "$SLOTS"; return; }   # 손으로 정할 때: SLOTS="08 20,08 30,09 00" bash run.sh prepare|publish
  node -e '
    const [feed, date] = process.argv.slice(1);
    const win = process.env.WIN;   /* 밀린 글 오늘 올리기: WIN=14:00 이면 모든 계정이 그 시각부터 1시간 안에 첫 글, 글 사이 40~80분 */
    if (!win && !["mih_agency", "mih_speaker", "mih_casting"].includes(feed)) { console.log("08 00,08 30,09 00"); process.exit(); }
    let h = 2166136261; for (const c of feed + date) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = (n) => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^ (h >>> 16)) >>> 0) % n; };
    let t = win ? (win.split(":")[0] * 60 + +win.split(":")[1]) + rnd(7) * 10 : 7*60 + rnd(13) * 10; const out = [];
    for (let i = 0; i < 3; i++) { out.push(String(Math.floor(t / 60)).padStart(2, "0") + " " + String(t % 60).padStart(2, "0")); t += 40 + rnd(5) * 10; }
    console.log(out.join(","));' "$1" "$DATE"
}

js() { local n=$1; shift; printf '%s\n' "$*" > "$WORK/cmd$n.js"; bash "$K/send.sh" "$WORK" "$n" "$WORK/cmd$n.js"; }
tag() { grep -a "$1" | sed "s/^.*$1 //" | tail -1; }   # 출력에서 "<TAG> ..." 한 줄만 뽑는다

case "$1" in
times)   # bash run.sh times [YYYY-MM-DD] — 그 날짜의 계정별 예약 시각만 출력 (알림 문구에 쓴다)
  for a in "${ACCOUNTS[@]}"; do set -- $a; echo "$2 $(slots $2 | sed 's/ /:/g; s/,/ · /g')"; done ;;

sessions)
  for a in "${ACCOUNTS[@]}"; do set -- $a
    # 이미 떠 있는 프로필에 Start-Process 하면 닫을 수 없는 빈 '새 탭' 창이 쌓인다 → Aside 가 꺼졌다고 답할 때만 띄운다.
    # 세션이 뜨는 데 60초까지 걸리니 시간 초과는 꺼짐으로 보지 않는다(창을 띄우지 않고 그대로 세션을 붙인다)
    up=$(timeout 90 aside repl --account "u$1" "console.log('UP')" 2>&1)
    if grep -aqiE "isn't running|not running|ECONNREFUSED" <<< "$up"; then
      powershell -NoProfile -Command "Start-Process '$ASIDE_EXE' -ArgumentList '--profile-directory=\"Profile $1\"'"; sleep 3
    elif ! grep -aq '^UP' <<< "$up"; then echo "u$1 90초 안에 응답 없음 — 창은 띄우지 않고 세션만 붙인다"; fi
    : > "$WORK/in$1.txt"; : > "$WORK/out$1.txt"   # 비우지 않으면 tail -f 가 지난 명령을 다시 실행한다
    ( tail -f "$WORK/in$1.txt" | aside repl --account "u$1" > "$WORK/out$1.txt" 2>&1 ) &
  done
  wait ;;

prepare)
  lock; echo "발행일 $DATE"
  for a in "${ACCOUNTS[@]}"; do set -- $a; n=$1 feed=$2 blog=$3
    IFS=',' read -ra TIMES <<< "$(slots $feed)"
    bash "$K/send.sh" "$WORK" $n "$K/steps.js" | grep -q 'STEPS ok' || { echo "u$n 세션 없음 — sessions 먼저"; exit 1; }
    cnt=$(js $n "if (!globalThis.dash) globalThis.dash = await openTab('https://mih.bp-studio.com/$feed'); else await dash.reload(); await sleep(4000); console.log('CNT', await dash.locator('[data-copy-title]').count())" | tag CNT)
    echo "== $feed: 대기 원고 $cnt 개"
    for idx in $(seq 0 $((COUNT-1))); do set -- ${TIMES[$idx]}; hh=$1 mm=$2
      [ "$idx" -gt 0 ] && gap
      js $n "console.log('TTL', JSON.stringify(await stepText(dash,'$blog',$idx)))" >/dev/null
      txt=$(js $n "console.log('TXT', JSON.stringify(await stepBody(dash,$idx)))" | tag TXT)
      js $n "await hread(W[$idx]); console.log('READ ok')" >/dev/null
      img=$(node -e 'console.log(JSON.parse(process.argv[1]).firstImg)' "$txt" 2>/dev/null)
      for try in 1 2; do
        bash "$K/set-clipboard-image.sh" "$img" "$WORK" >/dev/null
        fin=$(js $n "console.log('REP', JSON.stringify(await stepRep($idx,'$img')))" | tag REP)
        [[ "$fin" == *'"err"'* ]] || { fin="$fin $(js $n "console.log('SCH', JSON.stringify(await stepSched($idx,'$DATE','$hh','$mm')))" | tag SCH)"; break; }
        js $n "for (let k=0;k<8;k++){ await W[$idx].evaluate((k)=>{const im=[...document.querySelectorAll('.se-component.se-image')]; if(im[k]) im[k].scrollIntoView({block:'center'});},k); await sleep(1500);} console.log('RESCROLL')" >/dev/null
      done
      echo "  $hh:$mm  $txt"; echo "         $fin"
    done
    gap 30 90
  done ;;

publish)
  lock
  for a in "${ACCOUNTS[@]}"; do set -- $a; n=$1 feed=$2
    IFS=',' read -ra TIMES <<< "$(slots $feed)"
    js $n "globalThis.PUBT = []" >/dev/null
    ok=()
    for idx in $(seq 0 $((COUNT-1))); do set -- ${TIMES[$idx]}
      [ "$idx" -gt 0 ] && gap 15 60
      pub=$(js $n "{ const q = await doPublish($idx,'$DATE','$1','$2'); if (q.ok) PUBT.push(q.title); console.log('PUB', JSON.stringify(q)) }" | tag PUB)
      echo "$feed $1:$2 $pub"
      [[ "$pub" == *'"ok":true'* ]] && ok+=("$1:$2")
    done
    echo "$feed 예약완료 체크: $(js $n "console.log('MARK', JSON.stringify(await markReserved(dash, PUBT)))" | tag MARK)"
    # 매일 알림은 그날 마지막 예약 시각 + 10분에 나간다(2026-10-24 Owner) → 예약에 성공한 시각을 DB 에 적는다
    node "$(git -C "$K" rev-parse --show-toplevel)/scripts/record-publish-slots.mjs" "$DATE" "$feed" "${ok[@]}"
  done ;;

report)
  shots=()
  win() { timeout 40 aside repl --account "u$1" "console.log('WIN', (await chrome.windows.getAll()).length)" 2>&1 | tag WIN; }
  for a in "${ACCOUNTS[@]}"; do set -- $a; n=$1 feed=$2 blog=$3
    w0=$(win $n)
    old=$(aside repl --account "u$n" "console.log('IDS', JSON.stringify((await listBrowserTabs()).map(x => x.targetId)))" 2>&1 | tag IDS)
    # 에이전트 창은 숨김 창이라 캡처가 안 된다 → 주소만 넘겨 그 프로필의 보이는 창에 새 탭으로 연다.
    # --new-window 금지: Aside 는 창을 닫지 못하게 해서 빈 창이 쌓인다(2026-10-13 25개)
    powershell -NoProfile -Command "Start-Process '$ASIDE_EXE' -ArgumentList '--profile-directory=\"Profile $n\"','https://blog.naver.com/PostWriteForm.naver?blogId=$blog&Redirect=Write'"; sleep 9
    # 새로 생긴 탭이 캡처 대상. 네이버 로그인이 풀렸으면 로그인 화면으로 넘어가 있다 → 캡처 없이 그 탭만 닫는다
    out=$(aside repl --account "u$n" "{ const old = ${old:-[]}; const c = (await listBrowserTabs()).filter(x => !old.includes(x.targetId)).sort((a, b) => a.url.includes('PostWriteForm') - b.url.includes('PostWriteForm')).pop(); console.log('TID', c.targetId); if (!c.url.includes('PostWriteForm')) console.log('TMP', 'LOGOUT 네이버 로그인 풀림'); else { const p = await attachBrowserTab(c.targetId); await sleep(3000); console.log('TMP', await p.evaluate(() => document.querySelector('button[aria-label^=\"임시저장된 글 보기\"]')?.getAttribute('aria-label'))); } }" 2>&1)
    tid=$(tag TID <<< "$out"); tmp=$(tag TMP <<< "$out")
    cap=; [[ -n "$tid" && "$tmp" != LOGOUT* ]] && cap=$(aside repl --account "u$n" "{ const TID = '$tid'; $(tr '\n' ' ' < "$K/capture-reserved.js") }" 2>&1 | tag CAP)
    echo "$feed | $tmp | $cap"
    if [ -n "$cap" ]; then
      f=$(ls -t /c/Users/*/.aside/u/$n/sessions/*/artifacts/reserved_full.png | head -1)
      read x y iw < <(node -e 'const c=JSON.parse(process.argv[1]); console.log(c.x, c.y, c.iw)' "$cap")
      powershell -NoProfile -File "$(cygpath -w "$K/crop.ps1")" "$(cygpath -w "$f")" "$(cygpath -w "$WORK/$feed.png")" $x $y $iw >/dev/null
      shots+=("$WORK/$feed.png")
    else echo "  캡처 실패 — 이 계정은 보내지 않는다"; fi
    # 캡처 창 닫기: 탭 API 로는 막히지만 Aside.exe 가 주소로 연 탭(기록 1개)이라 페이지 안 window.close() 는 먹는다. 키 입력·창 메시지 금지
    # 지속 세션이 연 탭(대시보드·글쓰기→글 목록)은 세션이 죽임당하면 남는다 → 살아 있을 때 closeTab 으로 닫는다(세션이 죽었으면 60초 뒤 넘어감)
    printf '%s\n' "{ const k = tabs.length; for (const t of [...tabs]) await closeTab(t).catch(() => {}); console.log('CLEAN', k + '->' + tabs.length) }" > "$WORK/cmd$n.js"
    echo "  세션 탭 정리: $(timeout 60 bash "$K/send.sh" "$WORK" $n "$WORK/cmd$n.js" | tag CLEAN)"
    # 세션 끝내기: exit 로 repl 이 끝나도 tail -f 는 다음 줄을 쓸 때까지 남아 sessions 가 안 끝난다 → 빈 줄 하나 더
    echo exit >> "$WORK/in$n.txt"
    [ -n "$tid" ] && echo "  캡처 창 닫힘:$(aside repl --account "u$n" "{ const p = await attachBrowserTab('$tid'); await p.evaluate(() => window.close()).catch(() => {}); await sleep(2000); console.log('CLOSED', !(await listBrowserTabs()).some(x => x.targetId === '$tid')); }" 2>&1 | tag CLOSED)"
    echo "  창 수: $w0 -> $(win $n)"
  done
  # 건너뛴 계정 세션까지 모두 끝내고, 빈 줄 하나 더 써서 남은 tail -f 를 끝낸다(안 하면 sessions 가 안 끝나 카드가 '진행'에 머문다)
  sleep 3; for f in "$WORK"/in[0-9].txt; do echo exit >> "$f"; done; sleep 3; for f in "$WORK"/in[0-9].txt; do echo >> "$f"; done
  [ -f "$LOCK" ] && grep -q " $(git rev-parse --show-toplevel 2>/dev/null)$" "$LOCK" && rm -f "$LOCK"
  echo "캡처: ${shots[*]}  ← Read 로 눈으로 확인한 뒤 send-aistudio.mjs 로 보낸다(AIStudio 알림 + Discord 신규 원고 알림 채널)" ;;

*) sed -n '2,10p' "$0" ;;
esac
