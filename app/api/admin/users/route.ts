import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/api-guards";
import { isAdminUsername, type AgencyRole } from "@/lib/permissions";
import { AGENCY_SLUGS, isAgencySlug, type AgencySlug } from "@/lib/agencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Permissions = Partial<Record<AgencySlug, AgencyRole | null>>;
type PostBody = { username?: string; password?: string; permissions?: Permissions };

function emptyPerms(): Record<AgencySlug, AgencyRole | null> {
  return { mih_speaker: null, mih_casting: null, mih_agency: null, other: null };
}

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  const sb = supabaseAdmin();
  const [usersRes, permsRes] = await Promise.all([
    sb.from("app_users").select("id, username, created_at").order("created_at"),
    sb.from("user_agency_permissions").select("user_id, agency, role"),
  ]);
  if (usersRes.error) return NextResponse.json({ error: usersRes.error.message }, { status: 500 });
  if (permsRes.error) return NextResponse.json({ error: permsRes.error.message }, { status: 500 });

  const byUser = new Map<string, Record<AgencySlug, AgencyRole | null>>();
  for (const u of usersRes.data ?? []) byUser.set(u.id, emptyPerms());
  for (const r of permsRes.data ?? []) {
    const agency = r.agency as AgencySlug;
    const role = r.role as AgencyRole;
    const map = byUser.get(r.user_id as string);
    if (map && isAgencySlug(agency)) map[agency] = role;
  }

  const users = (usersRes.data ?? []).map((u) => ({
    id: u.id,
    username: u.username,
    isAdmin: isAdminUsername(u.username),
    permissions: byUser.get(u.id) ?? emptyPerms(),
  }));

  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: created, error: insertErr } = await sb
    .from("app_users")
    .insert({ username, password })
    .select("id, username")
    .maybeSingle();
  if (insertErr) {
    const isDuplicate = insertErr.code === "23505";
    return NextResponse.json(
      { error: isDuplicate ? "username already exists" : insertErr.message },
      { status: isDuplicate ? 409 : 500 },
    );
  }
  if (!created) return NextResponse.json({ error: "insert failed" }, { status: 500 });

  const perms = body.permissions ?? {};
  const rows = AGENCY_SLUGS.flatMap<{ user_id: string; agency: AgencySlug; role: AgencyRole }>(
    (a) => {
      const role = perms[a];
      return role === "view" || role === "editor"
        ? [{ user_id: created.id, agency: a, role }]
        : [];
    },
  );
  if (rows.length > 0) {
    const { error: permErr } = await sb.from("user_agency_permissions").insert(rows);
    if (permErr) {
      return NextResponse.json({ error: `user created but permissions failed: ${permErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      user: {
        id: created.id,
        username: created.username,
        isAdmin: isAdminUsername(created.username),
        permissions: { ...emptyPerms(), ...perms },
      },
    },
    { status: 201 },
  );
}
