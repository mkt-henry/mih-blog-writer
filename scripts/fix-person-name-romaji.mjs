// articles.person_name 이 로마자 슬러그인 행을 제목의 정식 표기로 통일한다.
//
// 사용법:
//   node scripts/fix-person-name-romaji.mjs           # dry-run (기본)
//   node scripts/fix-person-name-romaji.mjs --apply    # 실제 갱신
//
// 배경: person_name 에 "bumsup", "haebara", "kim-gitae-soonsoonhee" 같은 파일 슬러그가
// 그대로 들어간 원고가 있다. 키워드는 한글이라 매칭이 깨지고, 같은 인물이 로마자·한글로
// 갈려 dedup 이 뚫린다(실제로 "해바라기"가 haebara/해바라기로 두 번 발행됐다).
//
// 지금은 lib/name-match.mjs 가 제목의 [인물명] 까지 봐서 중복 판정을 막고 있지만,
// 원본 데이터가 어긋난 상태를 유지하면 화면 표시·정렬·Discord 알림 등 제목을 보지 않는
// 경로에서 계속 문제가 된다. 그래서 person_name 자체를 제목 표기로 맞춘다.
//
// 안전장치
//   - 제목에서 이름을 못 뽑으면 건너뛴다(추측하지 않는다).
//   - 발행 여부와 무관하게 갱신한다. person_name 은 메타데이터이고 네이버에 올라간
//     본문·제목·URL 은 건드리지 않는다. slug 유니크 키(publish_date, agency, slug)도 그대로다.
//   - 바뀌는 값을 전부 출력해 눈으로 확인한 뒤 --apply 한다.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fetchAll } from "../lib/name-match.mjs";

config({ path: ".env.local" });

const apply = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 제목의 대괄호에서 **원본 표기 그대로** 이름을 뽑는다.
// name-match 의 titleName() 은 비교용이라 소문자·공백제거를 하므로 저장값으로는 쓸 수 없다.
const ROLE_SUFFIX = /(\s+(섭외|강연|초빙|출연))+$/;
function rawTitleName(title) {
  const m = String(title ?? "").match(/^\s*\[([^\]]+)\]/);
  if (!m) return null;
  const name = m[1].replace(ROLE_SUFFIX, "").trim();
  return name || null;
}

// 슬러그로 보이는 person_name: 전부 소문자 ASCII(+숫자/점/하이픈/공백).
// "2PM", "QWER", "BMK" 처럼 대문자 표기는 실제 활동명이므로 건드리지 않는다.
const isSlugLike = (s) => /^[a-z0-9._\- ]+$/.test(String(s ?? "").trim());

const arts = await fetchAll(sb, "articles", "id,person_name,title,agency,publish_date,published_at");

const updates = [];
const skipped = [];
for (const a of arts) {
  if (!isSlugLike(a.person_name)) continue;
  const proper = rawTitleName(a.title);
  if (!proper) {
    skipped.push({ ...a, why: "제목에서 이름 추출 실패" });
    continue;
  }
  if (proper === a.person_name) continue; // 이미 같음(예: god, 2am 처럼 소문자 활동명)
  updates.push({ id: a.id, from: a.person_name, to: proper, article: a });
}

console.log(`전체 원고 ${arts.length}건 / 슬러그형 person_name ${updates.length + skipped.length}건`);
console.log(`갱신 대상 ${updates.length}건, 건너뜀 ${skipped.length}건\n`);
for (const u of updates) {
  const state = u.article.published_at ? "발행" : "대기";
  console.log(`  ${u.from}  →  ${u.to}   [${u.article.agency}/${u.article.publish_date}/${state}]`);
}
for (const s of skipped) {
  console.log(`  (건너뜀) ${s.person_name} — ${s.why} | ${String(s.title).slice(0, 50)}`);
}

if (!apply) {
  console.log("\ndry-run 입니다. 실제 반영은 --apply 를 붙여 실행하세요.");
  process.exit(0);
}

let done = 0;
for (const u of updates) {
  const { error } = await sb.from("articles").update({ person_name: u.to }).eq("id", u.id);
  if (error) {
    console.error(`  ✗ ${u.from} → ${u.to}: ${error.message}`);
    continue;
  }
  done++;
}
console.log(`\n완료: ${done}/${updates.length}건 갱신`);
