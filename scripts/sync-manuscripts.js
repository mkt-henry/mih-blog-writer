#!/usr/bin/env node
// output/YYYY-MM-DD/{agency_slug}/*.html 파일을 Supabase manuscripts 테이블에 upsert.
// - GitHub Action에서 main push마다 실행
// - 로컬에서도 `npm run sync` (또는 `node --env-file=.env.local scripts/sync-manuscripts.js`)
//
// 옵션:
//   --since=<git-ref>   해당 ref 이후 변경된 파일만 동기화 (기본: 전체 스캔)
//   --dry-run           DB에 쓰지 않고 무엇이 업로드될지만 출력
//
// 환경변수:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (필수)
//
// 정책:
// - DB의 file_path는 agency 세그먼트를 포함하지 않는다 (`YYYY-MM-DD/filename.html`)
// - (agency_id, file_path)가 유니크 키
// - 같은 file_path가 다른 agency에도 들어갈 수 있음 (예: mih_speaker + mih_history)

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, sep } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const OUTPUT_DIR = join(ROOT, "output");
const VALID_SLUGS = new Set(["mih_speaker", "mih_casting", "mih_agency", "mih_history"]);

function parseArgs() {
  const args = { since: null, dryRun: false };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--since=")) args.since = a.slice("--since=".length);
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

function parseFileName(filename) {
  if (!filename.endsWith(".html")) return null;
  const withoutExt = filename.slice(0, -5);
  const idx = withoutExt.indexOf("_");
  if (idx === -1) return null;
  return { slug: withoutExt.slice(0, idx), title: withoutExt.slice(idx + 1) };
}

function listAllManuscripts() {
  const items = [];
  if (!existsSync(OUTPUT_DIR)) return items;

  for (const dateName of readdirSync(OUTPUT_DIR)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateName)) continue;
    const dateDir = join(OUTPUT_DIR, dateName);
    if (!statSync(dateDir).isDirectory()) continue;

    for (const agencySlug of readdirSync(dateDir)) {
      if (!VALID_SLUGS.has(agencySlug)) continue;
      const agencyDir = join(dateDir, agencySlug);
      if (!statSync(agencyDir).isDirectory()) continue;

      for (const file of readdirSync(agencyDir)) {
        if (!file.endsWith(".html")) continue;
        items.push({
          absPath: join(agencyDir, file),
          relPath: ["output", dateName, agencySlug, file].join("/"),
          dateName,
          agencySlug,
          file,
        });
      }
    }
  }
  return items;
}

function listChangedSince(ref) {
  const out = execSync(`git diff --name-only --diff-filter=AM ${ref} HEAD -- "output/"`, {
    cwd: ROOT,
    encoding: "utf8",
  });
  const all = listAllManuscripts();
  const allByRel = new Map(all.map((m) => [m.relPath, m]));
  const changed = [];
  for (const line of out.split(/\r?\n/)) {
    const path = line.trim();
    if (!path) continue;
    const m = allByRel.get(path);
    if (m) changed.push(m);
  }
  return changed;
}

async function fetchAgencyMap(supabase) {
  const { data, error } = await supabase.from("agencies").select("id, slug");
  if (error) throw new Error(`agencies 조회 실패: ${error.message}`);
  return new Map(data.map((a) => [a.slug, a.id]));
}

async function main() {
  const args = parseArgs();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const items = args.since ? listChangedSince(args.since) : listAllManuscripts();
  console.log(`대상 파일 ${items.length}개${args.since ? ` (since ${args.since})` : ""}${args.dryRun ? " [dry-run]" : ""}`);

  if (items.length === 0) {
    console.log("동기화할 파일 없음");
    return;
  }

  const agencyMap = await fetchAgencyMap(supabase);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const item of items) {
    const parsed = parseFileName(item.file);
    if (!parsed) {
      console.warn(`SKIP (invalid filename): ${item.relPath}`);
      skip += 1;
      continue;
    }
    const agencyId = agencyMap.get(item.agencySlug);
    if (!agencyId) {
      console.warn(`SKIP (unknown agency "${item.agencySlug}"): ${item.relPath}`);
      skip += 1;
      continue;
    }

    const filePath = `${item.dateName}/${item.file}`; // DB는 agency 세그먼트 제외
    const html = readFileSync(item.absPath, "utf8");
    const row = {
      agency_id: agencyId,
      file_path: filePath,
      title: parsed.title.trim(),
      slug: parsed.slug,
      date: item.dateName,
      html_content: html,
      updated_at: new Date().toISOString(),
    };

    if (args.dryRun) {
      console.log(`DRY: ${item.agencySlug} ← ${filePath} (${html.length} bytes)`);
      ok += 1;
      continue;
    }

    const { error } = await supabase
      .from("manuscripts")
      .upsert(row, { onConflict: "agency_id,file_path" });

    if (error) {
      console.error(`FAIL: ${item.relPath} — ${error.message}`);
      fail += 1;
    } else {
      console.log(`OK:   ${item.agencySlug} ← ${filePath}`);
      ok += 1;
    }
  }

  console.log(`\n결과: ok=${ok}, skip=${skip}, fail=${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
