// 키워드 중복 감사 — "이미 발행/작성한 인물이 다시 후보로 뽑히는" 사고를 사전에 잡는다.
//
// 사용법: node scripts/diag-keyword-dupe.mjs
//
// 점검 항목
//   [1] 같은 인물에 '발행본 + 미발행 초안'이 동시에 존재 → 초안 정리 대상
//   [2] 같은 인물에 발행본이 2건 이상 → 계정 중복 발행(1인 1원고 위반)
//   [3] keywords.published_url 미갱신 (발행 정본은 articles 이므로 표시 불일치)
//   [4] articles.person_name 이 로마자 슬러그 → 한글 키워드와 매칭 실패 위험
//   [5] 현재 후보 풀 규모
//
// 판정 규칙은 lib/name-match.mjs 를 그대로 쓴다(pick-keywords.mjs 와 동일).

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { norm, titleName, isExcluded, buildNameIndex, fetchAll } from "../lib/name-match.mjs";

config({ path: ".env.local" });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const [kw, arts] = await Promise.all([
  fetchAll(sb, "keywords", "id,keyword,category,agency,published_url,is_active"),
  fetchAll(sb, "articles", "id,person_name,title,agency,publish_date,published_at,published_url"),
]);

console.log(`키워드 ${kw.length}건 / 원고 ${arts.length}건`);

// 인물명(정규화) → 원고 묶음. person_name 과 제목 인물명 중 '대표 이름' 하나로 묶는다.
const groups = new Map();
for (const a of arts) {
  const key = titleName(a.title) || norm(a.person_name);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(a);
}

const fmt = (a) => `${a.publish_date}/${a.agency}/${a.published_at ? "발행" : "대기"}`;

// [1] 발행본 + 미발행 초안 동시 존재
const pubAndDraft = [...groups.entries()].filter(
  ([, v]) => v.some((a) => a.published_at) && v.some((a) => !a.published_at),
);
console.log(`\n[1] 발행본 + 미발행 초안 동시 존재: ${pubAndDraft.length}명 (초안 정리 대상)`);
for (const [n, v] of pubAndDraft) console.log(`   - ${n}: ${v.map(fmt).join(" , ")}`);

// [2] 발행본 2건 이상 (계정 불문 1인 1원고 위반)
const multiPub = [...groups.entries()].filter(([, v]) => v.filter((a) => a.published_at).length > 1);
console.log(`\n[2] 발행본 2건 이상: ${multiPub.length}명`);
for (const [n, v] of multiPub) console.log(`   - ${n}: ${v.filter((a) => a.published_at).map(fmt).join(" , ")}`);

// [3] keywords.published_url 정합성
const { written, published } = buildNameIndex(arts);
const kwPubFlag = kw.filter((k) => k.published_url).length;
const kwShouldPub = kw.filter((k) => published.has(norm(k.keyword)));
const pubGap = kwShouldPub.length - kwPubFlag;
console.log(
  `\n[3] 발행으로 판정되는 키워드 ${kwShouldPub.length}건 / keywords.published_url 세팅된 건 ${kwPubFlag}건`,
);
if (pubGap > 0) {
  console.log(`    → 미표기 ${pubGap}건. 'node scripts/sync-keyword-published.mjs --apply' 로 백필.`);
} else {
  // 음수는 '수동 표기했지만 articles 인물명과 안 맞는 키워드'(예: 키워드 "팬타곤 키노" ↔ 제목 "[키노 섭외]").
  // 후보 풀에서는 어차피 제외되므로 안전측이라 방치해도 된다.
  console.log(`    → 표기 누락 없음 (수동 표기 전용 ${-pubGap}건)`);
}

// [4] 로마자 person_name
const romaji = arts.filter((a) => /^[a-z0-9._\- ]+$/i.test((a.person_name || "").trim()));
const romajiNoTitle = romaji.filter((a) => !titleName(a.title));
console.log(`\n[4] person_name 이 로마자/슬러그인 원고: ${romaji.length}건`);
console.log(`    그중 제목에서도 한글명을 못 뽑는 원고: ${romajiNoTitle.length}건 (중복 판정 사각지대)`);
for (const a of romajiNoTitle.slice(0, 20)) console.log(`   - ${a.person_name} | ${a.title}`);

// [5] 후보 풀
const available = kw.filter(
  (k) => k.is_active !== false && !k.published_url && !isExcluded(k.keyword, written),
);
const byAgency = {};
for (const k of available) if (k.agency) byAgency[k.agency] = (byAgency[k.agency] || 0) + 1;
console.log(`\n[5] 미작성 후보 ${available.length}건 (output/ 미반영 — pick-keywords 는 output/ 도 제외)`);
console.log("    계정별:", byAgency);

// [6] 후보 풀에 남아 있으면 안 되는 키워드(= 이미 원고 있음) 재확인
const leak = available.filter((k) => written.has(norm(k.keyword)));
console.log(`\n[6] 후보 풀에 남은 '이미 원고 있는' 키워드: ${leak.length}건 (0이어야 정상)`);
if (leak.length) console.log("   ", leak.map((k) => k.keyword).join(", "));
