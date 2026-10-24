// 예약 발행에 성공한 시각을 DB(mih_publish_slots)에 적는다.
//
// 사용법 (run.sh publish 가 계정마다 부른다):
//   node scripts/record-publish-slots.mjs 2026-10-25 mih_agency 07:30 08:40 09:50
//
// 매일 알림(발행 현황·검색 노출)은 그날 마지막 예약 시각 + 10분에 나간다(2026-10-24 Owner).
// 예약 시각은 발행 전엔 어디에도 남지 않아 여기서 적는다. 같은 날·계정을 다시 돌리면 그 계정 시각을 갈아 끼운다
// (시각을 하나도 안 주면 그 계정 기록을 지운다). 실패해도 예약은 이미 걸렸으니 종료 코드만 1 — 그날 알림은 12:00 KST 로 간다.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });

export function slotRows(date, agency, times) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error(`날짜 형식이 아니다: ${date}`);
  if (!agency) throw new Error("계정 이름이 없다");
  return times.map((t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) throw new Error(`시각 형식이 아니다: ${t}`);
    return { publish_date: date, agency, slot_at: `${date}T${m[1].padStart(2, "0")}:${m[2]}:00+09:00` };
  });
}

async function main() {
  const [date, agency, ...times] = process.argv.slice(2);
  const rows = slotRows(date, agency, times);
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(".env.local 에 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 없다");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const del = await sb.from("mih_publish_slots").delete().eq("publish_date", date).eq("agency", agency);
  if (del.error) throw new Error(del.error.message);
  if (rows.length) {
    const ins = await sb.from("mih_publish_slots").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }
  const { data, error } = await sb.rpc("mih_daily_alerts_due_at", { d: date });
  const due = error ? "?" : new Date(data).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  console.log(`SLOTS ${date} ${agency} ${times.join(" ") || "(없음)"} → 그날 알림 ${due}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`SLOTS 기록 실패: ${e.message} — 그날 알림은 12:00 KST 로 간다`);
    process.exit(1);
  });
}
