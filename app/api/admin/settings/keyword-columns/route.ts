import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/api-guards";
import { normalizeColumns } from "@/lib/keyword-columns";
import { loadKeywordOnlyColumns } from "@/lib/keyword-columns.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.response;
  const columns = await loadKeywordOnlyColumns();
  return NextResponse.json({ columns });
}

export async function PUT(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  let body: { columns?: unknown };
  try {
    body = (await req.json()) as { columns?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.columns)) {
    return NextResponse.json({ error: "columns must be an array" }, { status: 400 });
  }
  const columns = normalizeColumns(body.columns.map(String));

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("app_config")
    .upsert(
      { key: "keyword_only_columns", value: columns, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ columns });
}
