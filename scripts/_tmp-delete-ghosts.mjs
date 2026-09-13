// 일회성: 이미 발행됐는데 대기로 남아 있던 중복 초안 4건 정리.
// 삭제 전 전체 행을 JSON 으로 백업한다. output/ html 파일은 건드리지 않는다.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync } from "node:fs";

config({ path: ".env.local", quiet: true });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const IDS = [
  "a923623a-4f1c-4329-b03b-032685b3715b", // 록킹돌 (Rocking Doll)
  "bf8de311-c81e-4fde-9150-33037f783d89", // CAMO(카모)
  "c09cf60a-8f65-4c35-81f3-353e55c64f57", // 알파드라이브원(ALPHA DRIVE ONE)
  "ff0a0ed8-acc9-413b-9389-3c50c532f7af", // DJ세라(SARAH)
];
const BACKUP = process.env.BACKUP_PATH;

const { data: before, error: readErr } = await sb.from("articles").select("*").in("id", IDS);
if (readErr) throw new Error(readErr.message);
if (before.length !== IDS.length) throw new Error(`대상 ${IDS.length}건 중 ${before.length}건만 조회됨 — 중단`);
if (before.some((r) => r.published_at)) throw new Error("발행본이 섞여 있다 — 중단");

writeFileSync(BACKUP, JSON.stringify(before, null, 2), "utf8");
console.log(`백업 ${before.length}건 → ${BACKUP}`);

const { error } = await sb.from("articles").delete().in("id", IDS);
if (error) throw new Error(error.message);
console.log("삭제 완료");
