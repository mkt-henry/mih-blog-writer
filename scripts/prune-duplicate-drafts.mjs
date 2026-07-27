// 유령 초안 정리 — 이미 발행된 인물의 미발행 초안(articles 행 + output/ html)을 지운다.
//
// 사용법:
//   node scripts/prune-duplicate-drafts.mjs           # dry-run (기본)
//   node scripts/prune-duplicate-drafts.mjs --apply    # 실제 삭제
//
// 배경: 후보 추출·피드 dedup 이 깨져 있던 동안(PostgREST 1000행 제한 + person_name 로마자 불일치)
// 이미 발행한 인물의 원고가 다시 작성됐다. 1인 1원고 규칙에 따라 미발행 쪽을 정리한다.
//
// 안전장치
//   - 발행본(published_at 있음)은 절대 지우지 않는다. 네이버에 이미 박제된 글이다.
//   - output/ html 은 발행본의 source_path 와 겹치면 지우지 않는다.
//   - 같은 파일을 두 초안이 참조하는 경우가 있어 파일 삭제는 한 번만 한다.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { namesOf, fetchAll } from "../lib/name-match.mjs";

config({ path: ".env.local" });

const apply = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const arts = await fetchAll(
  sb,
  "articles",
  "id,person_name,title,agency,publish_date,published_at,source_path",
);

const publishedRows = arts.filter((a) => a.published_at);
const publishedNames = new Set(publishedRows.flatMap(namesOf));
const publishedPaths = new Set(publishedRows.map((a) => a.source_path).filter(Boolean));

// 발행본이 이미 있는 미발행 초안
const targets = arts.filter(
  (a) => !a.published_at && namesOf(a).some((n) => publishedNames.has(n)),
);

console.log(`전체 원고 ${arts.length}건 / 발행 ${publishedRows.length}건`);
console.log(`삭제 대상 초안: ${targets.length}건\n`);

const filesToDelete = new Set();
for (const a of targets) {
  const path = a.source_path ? join("output", a.source_path) : null;
  let fileNote = "(source_path 없음)";
  if (path) {
    if (publishedPaths.has(a.source_path)) fileNote = `보존(발행본과 동일 경로): ${a.source_path}`;
    else if (!existsSync(path)) fileNote = `파일 없음: ${a.source_path}`;
    else {
      filesToDelete.add(path);
      fileNote = `삭제: ${a.source_path}`;
    }
  }
  console.log(`  - ${a.agency} ${a.publish_date} ${a.person_name}\n      ${fileNote}`);
}
console.log(`\nDB 행 ${targets.length}건 / 파일 ${filesToDelete.size}개 삭제 예정`);

if (!apply) {
  console.log("\ndry-run 입니다. 실제 삭제는 --apply 를 붙여 실행하세요.");
  process.exit(0);
}

let dbDone = 0;
for (const a of targets) {
  // published_at is null 조건을 다시 걸어 경합 시에도 발행본을 지우지 않도록 방어한다.
  const { error } = await sb.from("articles").delete().eq("id", a.id).is("published_at", null);
  if (error) {
    console.error(`  ✗ DB 삭제 실패 ${a.person_name}: ${error.message}`);
    continue;
  }
  dbDone++;
}

let fileDone = 0;
for (const p of filesToDelete) {
  try {
    unlinkSync(p);
    fileDone++;
  } catch (e) {
    console.error(`  ✗ 파일 삭제 실패 ${p}: ${e.message}`);
  }
}

console.log(`\n완료: DB ${dbDone}/${targets.length}건, 파일 ${fileDone}/${filesToDelete.size}개 삭제`);
