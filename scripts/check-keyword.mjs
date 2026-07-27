// 작성 착수 전 중복 검사 게이트.
//
// 사용법:
//   node scripts/check-keyword.mjs "이무진" "팬타곤 키노" "김미경"
//
// 종료코드: 중복이 하나라도 있으면 1, 전부 작성 가능하면 0.
//   → 원고 작성을 시작하기 전 이 명령이 0 을 돌려주는지 반드시 확인한다.
//
// pick-keywords.mjs 는 랜덤 추출 경로만 막아 준다. 사용자가 인물을 직접 지정하거나
// 후보를 손으로 고른 경우에도 같은 기준으로 걸러야 해서 단건 검사를 따로 둔다.
// 판정 기준은 lib/name-match.mjs (pick-keywords 와 완전히 동일):
//   articles 인물명(person_name + 제목 [인물명]) / output/ 대기 원고 / keywords.published_url

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { norm, excludeReason, buildNameIndex, fileNames, fetchAll } from "../lib/name-match.mjs";

config({ path: ".env.local" });

const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (names.length === 0) {
  console.error('사용법: node scripts/check-keyword.mjs "인물명" ["인물명2" ...]');
  process.exit(2);
}

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
    if (st.isDirectory()) collectOutputNames(p, acc);
    else if (e.toLowerCase().endsWith(".html")) for (const n of fileNames(e)) acc.add(n);
  }
  return acc;
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const [kw, arts] = await Promise.all([
  fetchAll(sb, "keywords", "keyword,published_url"),
  fetchAll(sb, "articles", "person_name,title,agency,publish_date,published_at,published_url"),
]);

const { written, published } = buildNameIndex(arts);
const outputNames = collectOutputNames("output", new Set());

// 상세 안내용: 정규화 이름 → 원고 정보
const detail = new Map();
for (const a of arts) {
  for (const n of [norm(a.person_name), norm(a.title?.match(/^\s*\[([^\]]+)\]/)?.[1])].filter(Boolean)) {
    if (!detail.has(n)) detail.set(n, a);
  }
}
// keywords 쪽 수동 발행 표기
const kwPublished = new Set(kw.filter((k) => k.published_url).map((k) => norm(k.keyword)));

let dupCount = 0;
for (const name of names) {
  const inArticles = excludeReason(name, written);
  const inOutput = excludeReason(name, outputNames);
  const inKwFlag = excludeReason(name, kwPublished);

  if (!inArticles && !inOutput && !inKwFlag) {
    console.log(`✅ ${name} — 작성 가능 (중복 없음)`);
    continue;
  }
  dupCount++;
  const hit = inArticles ?? inOutput ?? inKwFlag;
  const art = detail.get(hit.matched);
  const state = art?.published_at ? `발행 완료(${art.publish_date}/${art.agency})` : "원고 있음(발행 대기)";
  const where = inArticles ? "articles" : inOutput ? "output/" : "keywords.published_url";
  const viaLabel = { exact: "동일 이름", alias: "표기 변형", prefix: "직함 포함" }[hit.via];
  console.log(`⛔ ${name} — 중복. 기존 "${hit.matched}" 와 ${viaLabel} 일치 (${where})`);
  console.log(`      상태: ${published.has(hit.matched) ? "발행 완료" : state}`);
  if (art?.title) console.log(`      기존 원고: ${art.title}`);
}

console.log(`\n검사 ${names.length}건 중 중복 ${dupCount}건`);
if (dupCount > 0) {
  console.log("중복 인물은 작성하지 않는다. 다른 후보로 교체하거나 사용자에게 확인받는다.");
  process.exit(1);
}
