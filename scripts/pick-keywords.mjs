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
//   0) keywords.is_active=false 이면 비활성 → 제외
//   1) keyword 가 articles 의 인물명(person_name **또는 제목의 [인물명])과 일치 → 제외
//      = 원고가 한 번이라도 만들어진 인물은 계정 불문 제외. 발행 여부와 무관.
//      person_name 이 로마자 슬러그(bumsup 등)로 저장된 원고가 있어 제목도 함께 본다.
//   2) keywords.published_url 이 있으면 = 발행 완료(수동 표기) → 제외
//   3) keyword 가 output/ 폴더의 html 파일명(슬러그 접두어 또는 [인물명 섭외])과 일치 → 제외
//      (DB 에 아직 upload 되지 않은 대기 원고까지 잡기 위함)
//
// 판정 로직은 lib/name-match.mjs 에 모아 두었다(app/키워드 페이지와 동일 규칙). 여기서 복제하지 말 것.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { aliasesOf, excludeReason, buildNameIndex, fileNames, fetchAll } from "../lib/name-match.mjs";

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

// --- output/ 폴더의 html 파일명에서 인물명 수집 ---
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
      for (const n of fileNames(e)) acc.add(n);
    }
  }
  return acc;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  // --why 등 플래그는 agency=count 파싱에서 제외한다.
  const reqs = parseArgs(process.argv.slice(2).filter((a) => !a.startsWith("--")));
  if (reqs.length === 0) {
    console.error("사용법: node scripts/pick-keywords.mjs mih_speaker=3 other=5");
    process.exit(1);
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  // fetchAll: PostgREST 기본 1000행 제한을 넘겨 전체를 가져온다. (일반 select 는 1000행에서 잘림)
  const [kw, arts] = await Promise.all([
    fetchAll(sb, "keywords", "keyword,category,agency,published_url,is_active"),
    fetchAll(sb, "articles", "person_name,title,published_at,published_url"),
  ]);

  // 제외 집합: articles 인물명(person_name + 제목) + output/ 파일명
  const { written, published } = buildNameIndex(arts);
  const excluded = new Set(written);
  const outputNames = collectOutputNames("output", new Set());
  for (const n of outputNames) excluded.add(n);

  // 미작성 후보: 제외 집합에 없음 + keywords 쪽 발행 표기도 없음
  const available = [];
  // 표기 변형·부분 겹침으로 제외된 건 — 오탈락 확인용으로 보여준다(exact/prefix 는 자명해서 생략).
  const fuzzyDrops = [];
  for (const k of kw || []) {
    if (k.is_active === false || k.published_url) continue;
    const reason = excludeReason(k.keyword, excluded);
    if (!reason) {
      available.push(k);
    } else if (reason.via === "alias" || reason.via === "substring") {
      fuzzyDrops.push({
        keyword: k.keyword,
        matched: reason.matched,
        via: reason.via,
        agency: k.agency,
      });
    }
  }

  // 전역 중복 방지(같은 키워드가 한 실행에서 두 번 뽑히지 않게)
  const usedThisRun = new Set();
  const result = {};

  for (const { agency, count } of reqs) {
    if (!VALID_AGENCIES.includes(agency)) {
      console.error(`알 수 없는 계정: ${agency} (${VALID_AGENCIES.join("/")})`);
      process.exit(1);
    }
    const pool = shuffle(
      // 한 실행 안에서도 같은 인물이 두 번 뽑히지 않게 제외 판정을 그대로 적용한다.
      // exact 비교만 하면 "키노"와 "팬타곤 키노"가 서로 다른 계정으로 각각 뽑힌다(후보 풀에 147쌍 존재).
      available.filter((k) => k.agency === agency && !excludeReason(k.keyword, usedThisRun)),
    );
    const poolSize = pool.length;
    const picked = pool.slice(0, count);
    // 별칭까지 등록한다. 완전명만 넣으면 "HAON(김하온)" 을 뽑은 뒤 "김하온" 이 그대로 통과한다.
    picked.forEach((k) => aliasesOf(k.keyword).forEach((a) => usedThisRun.add(a)));
    result[agency] = { picked, poolSize, count };
  }

  // --- 출력 ---
  console.log("\n=== 랜덤 키워드 셀렉트 결과 ===");
  console.log(
    `전체 키워드 ${(kw || []).length} / 원고 ${arts.length}건 / 제외 인물명 ${excluded.size}종(발행 ${published.size}종) / 미작성 후보 ${available.length}\n`,
  );
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
  // fuzzy 제외분 — 대부분 정당한 중복이지만, 괄호가 소속을 뜻하는 경우("이선호(엑소)")나
  // 남남인데 이름이 겹치는 경우("이브"↔"아이브")도 섞이므로 눈으로 확인할 수 있게 남긴다.
  if (fuzzyDrops.length) {
    const byVia = { alias: 0, substring: 0 };
    for (const d of fuzzyDrops) byVia[d.via]++;
    console.log(
      `※ 이름 겹침으로 제외된 후보 ${fuzzyDrops.length}건 (표기변형 ${byVia.alias} / 부분겹침 ${byVia.substring}) — --why 로 상세`,
    );
    if (process.argv.includes("--why")) {
      const label = { alias: "표기변형", substring: "부분겹침" };
      for (const d of fuzzyDrops) {
        console.log(`   - ${d.keyword} [${d.agency}] ← 기존 원고 "${d.matched}" (${label[d.via]})`);
      }
    }
    console.log("");
  }

  console.log("위 후보로 작성을 진행하려면 사용자에게 확인을 받은 뒤 01→02→03 지침을 따른다.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
