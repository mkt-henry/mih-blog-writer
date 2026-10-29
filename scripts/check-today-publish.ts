// 오늘 발행 점검: 계정별 3편이 블로그에 실제로 올라왔는지 RSS 로 세고,
// 모자라면 No.VI 에 할 일 카드를 바로 만든다(같은 날은 한 번만 — --key 로 막는다).
//
// 사용법:
//   npx tsx scripts/check-today-publish.ts            # 점검 + 미달이면 할 일 카드
//   npx tsx scripts/check-today-publish.ts --dry-run  # 카드 없이 결과만
//
// 종료코드: 다 채웠으면 0, 미달이면 1(카드를 만들었든 아니든), 점검 자체가 실패하면 2.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fetchAllRss } from "../lib/daily-report.server";
import { checkPublish, todoCard, type DbArticle } from "../lib/publish-check";

config({ path: ".env.local" });
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const { rss, errors } = await fetchAllRss();
  if (errors.length) {
    // RSS 를 못 받은 계정을 0건으로 세면 거짓 경보가 된다 — 점검 실패로 끝낸다.
    console.error(`RSS 받기 실패: ${errors.join(", ")}`);
    process.exit(2);
  }

  const supabase = createClient((process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const cols = "agency,published_at,reserved_at,published_url";
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  // 오늘 날짜로 걸린 예약(최근 사흘 안) + 아직 아무것도 안 된 대기 원고. 둘 다 1,000행 한도에 한참 못 미친다.
  const [scheduled, waiting] = await Promise.all([
    supabase.from("articles").select(cols).gte("published_at", since),
    supabase.from("articles").select(cols).is("published_at", null).is("reserved_at", null).is("published_url", null),
  ]);
  const error = scheduled.error ?? waiting.error;
  if (error) {
    console.error(`DB 조회 실패: ${error.message}`);
    process.exit(2);
  }

  const rows = [...(scheduled.data ?? []), ...(waiting.data ?? [])] as DbArticle[];
  const c = checkPublish(rss, rows, Date.now());
  for (const a of c.accounts) console.log(`${a.label}: ${a.published}/3${a.short ? ` — ${a.reason}` : ""}`);
  console.log(`합계 ${c.published}/${c.target}`);
  if (c.shortAccounts.length === 0) return 0;

  const card = todoCard(c);
  if (dryRun) {
    console.log(`[dry-run] 할 일 카드: ${card.title}\n${card.text}`);
    return 1;
  }
  const py = process.platform === "win32" ? "python" : "python3";
  const r = spawnSync(
    py,
    [
      join(homedir(), ".novi", "bin", "novi_cards.py"),
      "todo",
      "--project", "mih-blog-writer",
      "--title", card.title,
      "--text", card.text,
      "--due", c.day,
      "--key", `mih-publish-short:${c.day}`,
    ],
    { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } },
  );
  console.log((r.stdout || "").trim());
  // 같은 날 키로 이미 만든 카드가 있으면(다른 카드가 먼저 돌렸거나 대기 원고 수가 바뀐 재실행) 서버가 409 로 거절한다.
  // 카드는 이미 있으니 점검 실패가 아니라 미달(1)로 끝낸다.
  if (r.status !== 0 && /409|이미 접수한/.test(r.stderr || "")) {
    console.log(`할 일 카드는 오늘(${c.day}) 이미 만들어져 있어 새로 만들지 않았어`);
    return 1;
  }
  if (r.status !== 0) {
    console.error(`할 일 카드 만들기 실패: ${(r.stderr || "").trim()}`);
    process.exit(2);
  }
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
