import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수를 설정해야 합니다."
  );
}

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
