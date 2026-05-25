import { NextResponse } from "next/server";
import { verifySession, type SessionUser } from "./auth";
import { loadPermissions, canEdit, type UserPermissions } from "./permissions";
import type { AgencySlug } from "./agencies";

export type GuardSuccess = { ok: true; user: SessionUser; perms: UserPermissions };
export type GuardFailure = { ok: false; response: NextResponse };
export type GuardResult = GuardSuccess | GuardFailure;

function unauth(): GuardFailure {
  return { ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
}

function forbid(reason: string): GuardFailure {
  return { ok: false, response: NextResponse.json({ error: reason }, { status: 403 }) };
}

export async function requireSession(): Promise<GuardResult> {
  const user = await verifySession();
  if (!user) return unauth();
  const perms = await loadPermissions(user.id, user.username);
  return { ok: true, user, perms };
}

export async function requireAdmin(): Promise<GuardResult> {
  const r = await requireSession();
  if (!r.ok) return r;
  if (!r.perms.isAdmin) return forbid("admin only");
  return r;
}

export async function requireEditor(agency: AgencySlug): Promise<GuardResult> {
  const r = await requireSession();
  if (!r.ok) return r;
  if (!canEdit(r.perms, agency)) return forbid(`no edit permission for ${agency}`);
  return r;
}
