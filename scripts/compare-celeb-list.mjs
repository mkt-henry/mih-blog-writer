// MIH 사이트 연예인 리스트 ↔ 기존 키워드 비교
//
// 외부에서 받은 인물 리스트(엑셀/CSV/TXT)를 현재 등록·발행된 키워드와 대조해서
//   - 신규(미등록)  : 어디에도 없음 → 새 작성 후보
//   - 등록·미발행   : keywords 에는 있으나 아직 발행/작성 안 됨
//   - 발행/작성됨   : published_url 있음 또는 articles/output 에 존재
// 로 분류한다. 정규화 규칙은 scripts/pick-keywords.mjs 와 동일.
//
// 사용법:
//   node scripts/compare-celeb-list.mjs data/mih-celebs.xlsx
//   node scripts/compare-celeb-list.mjs data/list.csv
//
// 엑셀(.xlsx)은 이 환경의 python(openpyxl)으로 첫 컬럼(헤더 "키워드")을 추출한다.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname } from "node:path";

config({ path: ".env.local" });

// --- 정규화 (pick-keywords.mjs 와 동일) ---
const stripParen = (s) => (s || "").replace(/[\(（].*$/s, "").trim();
const norm = (s) => stripParen(s).replace(/\s+/g, "").toLowerCase();

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
    if (st.isDirectory()) collectOutputNames(p, acc);
    else if (e.toLowerCase().endsWith(".html")) {
      const prefix = e.split("_")[0].trim();
      if (prefix) acc.add(norm(prefix));
    }
  }
  return acc;
}

// --- 리스트 파일에서 인물명 추출 ---
function readNamesFromFile(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") return readNamesFromXlsx(path);
  // csv / txt: 각 줄 첫 셀(쉼표/탭 구분)을 이름으로
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const names = [];
  for (const [i, line] of lines.entries()) {
    const first = line.split(/[,\t]/)[0].trim();
    if (!first) continue;
    // 첫 줄이 헤더("키워드"/"이름")면 건너뜀
    if (i === 0 && /^(키워드|이름|name|연예인)$/i.test(first)) continue;
    names.push(first);
  }
  return names;
}

function readNamesFromXlsx(path) {
  // 모든 시트의 첫 컬럼(헤더 행 제외)을 이름으로 추출. ensure_ascii 로 인코딩 안전.
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
names = []
for ws in wb.worksheets:
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue  # 헤더
        if not row:
            continue
        v = row[0]
        if v is None:
            continue
        s = str(v).strip()
        if s:
            names.append(s)
print(json.dumps(names))
`;
  const out = execFileSync("python", ["-c", py, path], {
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("사용법: node scripts/compare-celeb-list.mjs <리스트파일(.xlsx/.csv/.txt)>");
    process.exit(1);
  }

  // 1) 리스트 인물명 (정규화 후 중복 제거, 원본 표기 보존)
  const rawNames = readNamesFromFile(file);
  const listMap = new Map(); // norm -> 대표 원본 표기
  for (const n of rawNames) {
    const k = norm(n);
    if (k && !listMap.has(k)) listMap.set(k, stripParen(n).trim() || n.trim());
  }

  // 2) 기존 키워드 소스
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const [{ data: kw, error: kwErr }, { data: arts, error: artErr }] = await Promise.all([
    sb.from("keywords").select("keyword,category,agency,published_url"),
    sb.from("articles").select("person_name"),
  ]);
  if (kwErr) throw kwErr;
  if (artErr) throw artErr;

  const registered = new Map(); // norm -> keyword row (등록됨)
  (kw || []).forEach((k) => {
    const key = norm(k.keyword);
    if (key) registered.set(key, k);
  });

  // 발행/작성 완료 집합
  const done = new Set();
  (kw || []).forEach((k) => {
    if (k.published_url) done.add(norm(k.keyword));
  });
  (arts || []).forEach((a) => done.add(norm(a.person_name)));
  collectOutputNames("output", done);

  // 3) 분류
  const result = { new: [], pending: [], done: [] };
  for (const [key, label] of listMap) {
    if (done.has(key)) {
      const k = registered.get(key);
      result.done.push({ name: label, category: k?.category || "", agency: k?.agency || "" });
    } else if (registered.has(key)) {
      const k = registered.get(key);
      result.pending.push({ name: label, category: k?.category || "", agency: k?.agency || "" });
    } else {
      result.new.push({ name: label });
    }
  }

  // 4) 출력
  console.log("\n=== 연예인 리스트 ↔ 기존 키워드 비교 ===");
  console.log(`리스트 인물(중복 제거): ${listMap.size}`);
  console.log(`  ✅ 신규(미등록)     : ${result.new.length}`);
  console.log(`  📝 등록·미발행      : ${result.pending.length}`);
  console.log(`  🚀 발행/작성 완료   : ${result.done.length}\n`);

  const show = (title, arr, withMeta) => {
    console.log(`--- ${title} (${arr.length}) ---`);
    arr
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .forEach((r, i) =>
        console.log(
          `  ${i + 1}. ${r.name}` + (withMeta && r.category ? `  [${r.category}/${r.agency || "-"}]` : ""),
        ),
      );
    console.log("");
  };
  show("✅ 신규(미등록) — 새 작성 후보", result.new, false);
  show("📝 등록·미발행", result.pending, true);

  // 5) 파일 저장 (전체 분류)
  const outPath = "data/compare-result.json";
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
  console.log(`전체 결과(발행완료 포함) 저장: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
