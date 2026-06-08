import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/api-guards";
import { isAdminUsername, type AgencyRole } from "@/lib/permissions";
import { isAgencySlug, type AgencySlug } from "@/lib/agencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Permissions = Partial<Record<AgencySlug, AgencyRole | null>>;
type PatchBody = { password?: string; permissions?: Permissions; keyword_only?: boolean };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: target, error: fetchErr } = await sb
    .from("app_users")
    .select("id, username")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (isAdminUsername(target.username) && body.permissions !== undefined) {
    return NextResponse.json(
      { error: "admin user permissions are env-controlled" },
      { status: 400 },
    );
  }

  if (body.keyword_only !== undefined) {
    if (isAdminUsername(target.username)) {
      return NextResponse.json({ error: "cannot set keyword_only on admin" }, { status: 400 });
    }
    const { error } = await sb
      .from("app_users")
      .update({ keyword_only: !!body.keyword_only })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.password !== undefined) {
    if (!body.password) return NextResponse.json({ error: "password empty" }, { status: 400 });
    const { error } = await sb.from("app_users").update({ password: body.password }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.permissions !== undefined) {
    for (const [agencyKey, role] of Object.entries(body.permissions)) {
      if (!isAgencySlug(agencyKey)) continue;
      const agency = agencyKey as AgencySlug;
      if (role === null) {
        const { error } = await sb
          .from("user_agency_permissions")
          .delete()
          .eq("user_id", id)
          .eq("agency", agency);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else if (role === "view" || role === "editor") {
        const { error } = await sb
          .from("user_agency_permissions")
          .upsert(
            { user_id: id, agency, role },
            { onConflict: "user_id,agency" },
          );
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        return NextResponse.json({ error: `invalid role: ${role}` }, { status: 400 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const { id } = await params;
  if (id === g.user.id) {
    return NextResponse.json({ error: "cannot delete yourself" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: target } = await sb.from("app_users").select("username").eq("id", id).maybeSingle();
  if (target && isAdminUsername(target.username)) {
    return NextResponse.json({ error: "cannot delete admin user" }, { status: 400 });
  }

  const { error } = await sb.from("app_users").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
