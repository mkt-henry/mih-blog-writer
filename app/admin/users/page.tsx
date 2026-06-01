import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { loadPermissions, isAdminUsername, type AgencyRole } from "@/lib/permissions";
import type { AgencySlug } from "@/lib/agencies";
import { supabaseAdmin } from "@/lib/supabase";
import UsersTable from "./_components/UsersTable";

export const dynamic = "force-dynamic";

export type AdminUserRow = {
  id: string;
  username: string;
  isAdmin: boolean;
  permissions: Record<AgencySlug, AgencyRole | null>;
};

function emptyPerms(): Record<AgencySlug, AgencyRole | null> {
  return { mih_speaker: null, mih_casting: null, mih_agency: null, other: null };
}

export default async function AdminUsersPage() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  if (!perms.isAdmin) redirect("/");

  const sb = supabaseAdmin();
  const [usersRes, permsRes] = await Promise.all([
    sb.from("app_users").select("id, username, created_at").order("created_at"),
    sb.from("user_agency_permissions").select("user_id, agency, role"),
  ]);

  if (usersRes.error) {
    return <main className="p-6 text-red-700">사용자 조회 실패: {usersRes.error.message}</main>;
  }
  if (permsRes.error) {
    return <main className="p-6 text-red-700">권한 조회 실패: {permsRes.error.message}</main>;
  }

  const byUser = new Map<string, Record<AgencySlug, AgencyRole | null>>();
  for (const u of usersRes.data ?? []) byUser.set(u.id, emptyPerms());
  for (const r of permsRes.data ?? []) {
    const map = byUser.get(r.user_id as string);
    if (map) map[r.agency as AgencySlug] = r.role as AgencyRole;
  }

  const rows: AdminUserRow[] = (usersRes.data ?? []).map((u) => ({
    id: u.id,
    username: u.username,
    isAdmin: isAdminUsername(u.username),
    permissions: byUser.get(u.id) ?? emptyPerms(),
  }));

  return (
    <div className="min-h-screen bg-[color:var(--color-muted)]">
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-lg font-bold mb-4">사용자 관리</h1>
        <UsersTable initialUsers={rows} currentUserId={user.id} />
      </main>
    </div>
  );
}
