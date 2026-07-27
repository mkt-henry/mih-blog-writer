// keywords.published_url 백필 — 발행 정본(articles)을 키워드 테이블에 반영한다.
//
// 사용법:
//   node scripts/sync-keyword-published.mjs             # dry-run (쓰기 없음, 기본)
//   node scripts/sync-keyword-published.mjs --apply      # 빈 published_url 채우기
//   node scripts/sync-keyword-published.mjs --apply --overwrite  # 기존값도 덮어쓰기
//
// 배경: 발행 파이프라인(publish-article.js / upload-pending.mjs)은 articles 만 갱신하고
// keywords 는 손대지 않는다. 그래서 발행 922건 중 keywords.published_url 이 채워진 건 9건뿐이었고,
// 키워드 화면의 '발행 완료' KPI 와 필터가 사실상 무동작이었다.
// 이 스크립트는 articles 의 발행 정보를 keywords 로 내려 표시·필터를 정합화한다.
// (중복 판정 자체는 articles 를 직접 보므로 이 백필에 의존하지 않는다 — lib/name-match.mjs)

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { norm, titleName, fetchAll } from "../lib/name-match.mjs";

config({ path: ".env.local" });

const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// articles.published_url 은 RSS 동기화 경로에서 "?fromRss=true&trackingCode=rss" 가 붙는다.
// 키워드 화면에 노출되는 값이므로 쿼리스트링을 떼고 정규 URL 로 저장한다.
const canonical = (u) => String(u ?? "").replace(/\?.*$/, "");

const [kw, arts] = await Promise.all([
  fetchAll(sb, "keywords", "id,keyword,published_url"),
  fetchAll(sb, "articles", "person_name,title,published_at,published_url,publish_date"),
]);

// 정규화 인물명 → 발행 URL. 같은 인물이 여러 번 발행됐으면 가장 이른 발행본을 쓴다.
const pubByName = new Map();
for (const a of arts) {
  if (!a.published_at && !a.published_url) continue;
  const url = canonical(a.published_url);
  if (!url) continue; // URL 없는 발행본은 표기할 값이 없다
  for (const n of [norm(a.person_name), titleName(a.title)].filter(Boolean)) {
    const prev = pubByName.get(n);
    if (!prev || (a.publish_date ?? "") < (prev.publish_date ?? "")) {
      pubByName.set(n, { url, publish_date: a.publish_date });
    }
  }
}

const updates = [];
const conflicts = [];
for (const k of kw) {
  const hit = pubByName.get(norm(k.keyword));
  if (!hit) continue;
  if (canonical(k.published_url) === hit.url) continue;
  const row = { id: k.id, keyword: k.keyword, from: k.published_url, to: hit.url };
  // 수동으로 넣은 기존값은 기본적으로 건드리지 않는다(--overwrite 로만 교체).
  if (k.published_url && !overwrite) conflicts.push(row);
  else updates.push(row);
}

console.log(`키워드 ${kw.length}건 / 발행 원고 인물명 ${pubByName.size}종`);
console.log(`갱신 대상: ${updates.length}건`);
for (const u of updates.slice(0, 20)) {
  console.log(`  - ${u.keyword}: ${u.from ?? "(없음)"} → ${u.to}`);
}
if (updates.length > 20) console.log(`  ... 외 ${updates.length - 20}건`);
if (conflicts.length) {
  console.log(`\n기존값과 다르지만 보존한 건: ${conflicts.length}건 (덮어쓰려면 --overwrite)`);
  for (const c of conflicts) console.log(`  - ${c.keyword}: 기존 ${c.from} / articles ${c.to}`);
}

if (!apply) {
  console.log("\ndry-run 입니다. 실제 반영은 --apply 를 붙여 실행하세요.");
  process.exit(0);
}

let done = 0;
for (const u of updates) {
  const { error } = await sb.from("keywords").update({ published_url: u.to }).eq("id", u.id);
  if (error) {
    console.error(`  ✗ ${u.keyword}: ${error.message}`);
    continue;
  }
  done++;
  if (done % 100 === 0) console.log(`  ... ${done}/${updates.length}`);
}
console.log(`\n완료: ${done}/${updates.length}건 갱신`);
