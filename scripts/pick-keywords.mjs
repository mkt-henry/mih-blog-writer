// 랜덤 키워드 셀렉트
// 사용자가 특정 키워드 없이 "계정별로 N개씩 써줘"라고 요청했을 때,
// 발행 완료/원고 작성(발행 대기) 키워드를 제외한 후보 풀에서 계정별로 랜덤 N개를 뽑는다.
//
// 사용법:
//   node scripts/pick-keywords.mjs mih_speaker=3 other=5 mih_casting=2
//   node scripts/pick-keywords.mjs other 4            (단일 계정 + 개수)
//
// 계정 귀속은 keywords.agency 컬럼을 따른다. (scripts/assign-keyword-agency.mjs 로 사전 분류)
//   강연자 → mih_speaker, 연예인 → mih_casting / mih_agency / other 균등 분할.
//   agency 가 비어 있는 키워드(단순키워드 등)는 인물 풀에서 제외된다.
//
// 제외 기준(중복 방지):
//   1) keywords.published_url 이 있으면 = 발행 완료 → 제외
//   2) keyword 가 articles.person_name 과 일치 = 원고 작성됨(발행 대기 포함) → 제외
//   3) keyword 가 output/ 폴더의 html 파일명 접두어(인물명)와 일치 → 제외
//      (DB 에 아직 publish 되지 않은 대기 원고까지 잡기 위함)

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });

const VALID_AGENCIES = ["mih_speaker", "mih_casting", "mih_agency", "other"];

// --- 인자 파싱: "agency=count" 쌍 또는 "agency count" 단일 ---
function parseArgs(argv) {
  const reqs = [];
  if (argv.length === 2 && !argv[0].includes("=") && /^\d+$/.test(argv[1])) {
    reqs.push({ agency: argv[0], count: Number(argv[1]) });
    return reqs;
  }
  for (const a of argv) {
    const m = a.match(/^([a-z_]+)=(\d+)$/i);
    if (!m) {
      console.error(`인자 형식 오류: "${a}" — agency=count 형식이어야 합니다.`);
      process.exit(1);
    }
    reqs.push({ agency: m[1], count: Number(m[2]) });
  }
  return reqs;
}

// --- output/ 폴더의 html 파일명 접두어(인물명) 수집 ---
function collectOutputNames(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectOutputNames(p, acc);
    } else if (e.toLowerCase().endsWith(".html")) {
      // 파일명 패턴: "{인물명}_[{인물명} 섭외] ....html"
      const prefix = e.split("_")[0].trim();
      if (prefix) acc.add(norm(prefix));
    }
  }
  return acc;
}

const norm = (s) => (s || "").replace(/\s+/g, "").toLowerCase();

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  const reqs = parseArgs(process.argv.slice(2));
  if (reqs.length === 0) {
    console.error("사용법: node scripts/pick-keywords.mjs mih_speaker=3 other=5");
    process.exit(1);
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const [{ data: kw, error: kwErr }, { data: arts, error: artErr }] = await Promise.all([
    sb.from("keywords").select("keyword,category,agency,published_url"),
    sb.from("articles").select("person_name"),
  ]);
  if (kwErr) throw kwErr;
  if (artErr) throw artErr;

  // 제외 집합: articles 인물명 + output/ 파일명 접두어
  const excluded = new Set();
  (arts || []).forEach((a) => excluded.add(norm(a.person_name)));
  collectOutputNames("output", excluded);

  // 미작성 후보: published_url 없음 + 제외 집합에 없음
  const available = (kw || []).filter(
    (k) => !k.published_url && !excluded.has(norm(k.keyword)),
  );

  // 전역 중복 방지(같은 키워드가 한 실행에서 두 번 뽑히지 않게)
  const usedThisRun = new Set();
  const result = {};

  for (const { agency, count } of reqs) {
    if (!VALID_AGENCIES.includes(agency)) {
      console.error(`알 수 없는 계정: ${agency} (${VALID_AGENCIES.join("/")})`);
      process.exit(1);
    }
    const pool = shuffle(
      available.filter(
        (k) => k.agency === agency && !usedThisRun.has(norm(k.keyword)),
      ),
    );
    const poolSize = pool.length;
    const picked = pool.slice(0, count);
    picked.forEach((k) => usedThisRun.add(norm(k.keyword)));
    result[agency] = { picked, poolSize, count };
  }

  // --- 출력 ---
  console.log("\n=== 랜덤 키워드 셀렉트 결과 ===");
  console.log(`전체 키워드 ${(kw || []).length} / 미작성 후보 ${available.length}\n`);
  for (const { agency, count } of reqs) {
    const r = result[agency];
    console.log(`■ ${agency}  (가용 ${r.poolSize}개 중 ${count}개 요청)`);
    if (r.picked.length < count) {
      console.log(`  ⚠ 가용 후보가 부족해 ${r.picked.length}개만 추출됨`);
    }
    r.picked.forEach((k, i) => {
      console.log(`  ${i + 1}. ${k.keyword}  [${k.category}]`);
    });
    console.log("");
  }
  console.log("위 후보로 작성을 진행하려면 사용자에게 확인을 받은 뒤 01→02→03 지침을 따른다.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
