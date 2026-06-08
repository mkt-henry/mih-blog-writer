// server-only: uses supabaseAdmin (service role). Do not import from client components.
import { supabaseAdmin } from "./supabase";
import {
  DEFAULT_KEYWORD_COLUMNS,
  normalizeColumns,
  type KeywordColumnKey,
} from "./keyword-columns";

// 전역 컬럼셋을 app_config 에서 로드. 누락/오류 시 기본값.
export async function loadKeywordOnlyColumns(): Promise<KeywordColumnKey[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("app_config")
    .select("value")
    .eq("key", "keyword_only_columns")
    .maybeSingle();
  const raw = data?.value;
  if (Array.isArray(raw)) return normalizeColumns(raw as string[]);
  return DEFAULT_KEYWORD_COLUMNS;
}
