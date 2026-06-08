import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const perms = await loadPermissions(session.id, session.username);
  if (perms.keywordOnly) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("articles").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
