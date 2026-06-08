import { supabaseAdmin } from "./supabase";
import { AGENCY_SLUGS, type AgencySlug } from "./agencies";

export type AgencyRole = "view" | "editor";

export type UserPermissions = {
  userId: string;
  username: string;
  isAdmin: boolean;
  keywordOnly: boolean;
  agencies: Record<AgencySlug, AgencyRole | null>;
};

export function isAdminUsername(username: string): boolean {
  const raw = process.env.ADMIN_USERNAMES ?? "bpark0718";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(username);
}

function emptyAgencies(): UserPermissions["agencies"] {
  return { mih_speaker: null, mih_casting: null, mih_agency: null, other: null };
}

export async function loadPermissions(
  userId: string,
  username: string,
): Promise<UserPermissions> {
  if (isAdminUsername(username)) {
    return {
      userId,
      username,
      isAdmin: true,
      keywordOnly: false,
      agencies: {
        mih_speaker: "editor",
        mih_casting: "editor",
        mih_agency: "editor",
        other: "editor",
      },
    };
  }

  const sb = supabaseAdmin();
  const [{ data }, { data: urow }] = await Promise.all([
    sb.from("user_agency_permissions").select("agency, role").eq("user_id", userId),
    sb.from("app_users").select("keyword_only").eq("id", userId).maybeSingle(),
  ]);

  const agencies = emptyAgencies();
  for (const r of data ?? []) {
    const agency = r.agency as AgencySlug;
    const role = r.role as AgencyRole;
    if (agency in agencies && (role === "view" || role === "editor")) {
      agencies[agency] = role;
    }
  }
  return { userId, username, isAdmin: false, keywordOnly: !!urow?.keyword_only, agencies };
}

export function visibleAgencies(p: UserPermissions): AgencySlug[] {
  return AGENCY_SLUGS.filter((a) => p.agencies[a] !== null);
}

export function canView(p: UserPermissions, a: AgencySlug): boolean {
  return p.agencies[a] !== null;
}

export function canEdit(p: UserPermissions, a: AgencySlug): boolean {
  return p.agencies[a] === "editor";
}
