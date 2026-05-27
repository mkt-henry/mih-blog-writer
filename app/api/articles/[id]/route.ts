import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions, canEdit } from "@/lib/permissions";
import { isAgencySlug } from "@/lib/agencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  instagram_url?: string | null;
  category?: string | null;
  notes?: string | null;
  set_published?: boolean;
  published_url?: string | null;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("articles").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: existing, error: fetchErr } = await sb
    .from("articles")
    .select("agency")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isAgencySlug(existing.agency)) {
    return NextResponse.json({ error: "invalid agency" }, { status: 500 });
  }

  const perms = await loadPermissions(session.id, session.username);
  if (!canEdit(perms, existing.agency)) {
    return NextResponse.json({ error: "no edit permission" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if ("instagram_url" in body) update.instagram_url = body.instagram_url ?? null;
  if ("category" in body) update.category = body.category ?? null;
  if ("notes" in body) update.notes = body.notes ?? "";

  if ("set_published" in body) {
    if (body.set_published) {
      update.published_at = new Date().toISOString();
      update.published_source = "manual";
      if (body.published_url !== undefined) update.published_url = body.published_url;
    } else {
      update.published_at = null;
      update.published_url = null;
      update.published_source = null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { data, error } = await sb.from("articles").update(update).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
