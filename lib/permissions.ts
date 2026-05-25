import { AGENCY_SLUGS, type AgencySlug } from "./agencies";

export type AgencyRole = "view" | "editor";

export type UserPermissions = {
  userId: string;
  username: string;
  isAdmin: boolean;
  agencies: Record<AgencySlug, AgencyRole | null>;
};

export function isAdminUsername(username: string): boolean {
  const raw = process.env.ADMIN_USERNAMES ?? "bpark0718";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(username);
}

function emptyAgencies(): UserPermissions["agencies"] {
  return { mih_speaker: null, mih_casting: null, mih_agency: null };
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
      agencies: {
        mih_speaker: "editor",
        mih_casting: "editor",
        mih_agency: "editor",
      },
    };
  }

  const { supabaseAdmin } = await import("./supabase");
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("user_agency_permissions")
    .select("agency, role")
    .eq("user_id", userId);

  const agencies = emptyAgencies();
  for (const r of data ?? []) {
    const agency = r.agency as AgencySlug;
    const role = r.role as AgencyRole;
    if (agency in agencies && (role === "view" || role === "editor")) {
      agencies[agency] = role;
    }
  }
  return { userId, username, isAdmin: false, agencies };
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
