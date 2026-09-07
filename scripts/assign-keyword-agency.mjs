// 키워드 → 계정(agency) 사전 분류 백필
//
// 규칙:
//   - category '강연자'              → mih_speaker
//   - category '가수'/'방송인'/'개그맨' (연예인)
//       · 이미 원고가 있으면        → 실제 발행 계정(articles.agency)
//       · 미작성이면                → mih_casting / mih_agency / other / mih_speaker 균등 랜덤 4분할
//   - category '단순키워드'           → 분류 안 함(null 유지, 카테고리 원고 04 지침용)
//
//   agency 가 이미 채워진 키워드는 건드리지 않는다(멱등). 새 키워드 추가 후 재실행하면 빈 것만 채운다.
//
// 사용법:
//   node scripts/assign-keyword-agency.mjs           # dry-run (분배안만 출력)
//   node scripts/assign-keyword-agency.mjs --apply    # 실제 DB 반영
//   node scripts/assign-keyword-agency.mjs --rebalance --apply
//       # 이미 배정됐지만 아직 원고가 없는 연예인 키워드까지 4계정 균등 재분배

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ENTERTAINER_CATEGORIES, ENTERTAINER_ACCOUNTS } from "../lib/artsro-categories.mjs";
import { fetchAll } from "../lib/name-match.mjs";

config({ path: ".env.local" });

// 공연 분류 전체가 연예인 3계정 분산 대상이다.
// (`가수`만 넣어두면 마술·마임·국악·댄스·기획공연 키워드가 agency=null 로 남아
//  계정별 후보 풀에서 통째로 빠진다.)
const ENTERTAINER = ENTERTAINER_CATEGORIES;
// 분산 대상 계정은 lib/artsro-categories.mjs 가 단일 출처다(크롤러와 공유).
const ENT_ACCOUNTS = ENTERTAINER_ACCOUNTS;
const norm = (s) => (s || "").replace(/\s+/g, "").toLowerCase();
const apply = process.argv.includes("--apply");
// --rebalance: agency 가 이미 있어도 "원고가 없는 연예인 키워드"는 후보 풀 귀속을
// 다시 섞는다. 계정 구성이 바뀌었을 때 한 번 돌리는 용도다(작성된 인물은 건드리지 않는다).
const rebalance = process.argv.includes("--rebalance");

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  // fetchAll: PostgREST 기본 1000행 제한을 넘겨 전체를 가져온다.
  // 그냥 select 하면 keywords 6,100+ 중 앞 1000행만 읽어서, 그 뒤에 추가된 키워드는
  // agency 가 영영 null 로 남고 계정별 후보 풀에서 통째로 빠진다.
  const [kw, arts] = await Promise.all([
    fetchAll(sb, "keywords", "id,keyword,category,agency,published_url"),
    fetchAll(sb, "articles", "person_name,agency,published_url"),
  ]);

  // 인물명 → 발행 계정 (published_url 있는 행 우선)
  const nameToAgency = new Map();
  for (const a of arts || []) {
    const key = norm(a.person_name);
    const cur = nameToAgency.get(key);
    if (!cur || (!cur.published_url && a.published_url)) {
      nameToAgency.set(key, { agency: a.agency, published_url: a.published_url });
    }
  }

  const targets = new Map(); // id → agency
  const entUnassigned = []; // 미작성 연예인 (랜덤 4분할 대상)
  let skipped = 0; // 이미 agency 있음
  let danma = 0; // 단순키워드 등 분류 제외

  for (const k of kw || []) {
    // --rebalance 일 때만, 원고가 아직 없는 연예인 키워드의 기존 배정을 다시 섞는다.
    const reassignable =
      rebalance &&
      ENTERTAINER.includes(k.category) &&
      !k.published_url &&
      !nameToAgency.get(norm(k.keyword))?.agency;
    if (k.agency && !reassignable) {
      skipped++;
      continue;
    }
    if (k.category === "강연자") {
      targets.set(k.id, "mih_speaker");
    } else if (ENTERTAINER.includes(k.category)) {
      const matched = nameToAgency.get(norm(k.keyword));
      if (matched?.agency) {
        targets.set(k.id, matched.agency);
      } else {
        entUnassigned.push(k);
      }
    } else {
      danma++; // 단순키워드 등 → null 유지
    }
  }

  // 미작성 연예인 균등 랜덤 4분할 (라운드로빈)
  shuffle(entUnassigned).forEach((k, i) => {
    targets.set(k.id, ENT_ACCOUNTS[i % ENT_ACCOUNTS.length]);
  });

  // 분배 집계
  const dist = {};
  for (const ag of targets.values()) dist[ag] = (dist[ag] || 0) + 1;

  console.log(`\n=== 키워드 계정 사전 분류 ${apply ? "(APPLY)" : "(dry-run)"} ===`);
  console.log(`전체 ${kw.length} / 이미 agency 있음 ${skipped} / 단순키워드 등 제외 ${danma}`);
  console.log(`이번에 분류할 키워드: ${targets.size}`);
  console.log("분배 결과:", dist);
  console.log(`  (그 중 연예인 미작성 균등 4분할: ${entUnassigned.length}개)`);

  if (!apply) {
    console.log("\n실제 반영하려면 --apply 플래그로 재실행하세요.");
    return;
  }

  // 계정별로 묶어 일괄 update
  const byAgency = {};
  for (const [id, ag] of targets) (byAgency[ag] ||= []).push(id);
  for (const [ag, ids] of Object.entries(byAgency)) {
    // 한 번의 in() 호출 크기 제한 방지를 위해 청크 처리
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await sb.from("keywords").update({ agency: ag }).in("id", chunk);
      if (error) throw error;
    }
    console.log(`  ${ag}: ${ids.length}건 반영`);
  }
  console.log("\n완료.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
