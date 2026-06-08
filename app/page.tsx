import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions, visibleAgencies } from "@/lib/permissions";
import { groupArticlesForKanban, computeKpis, type ArticleRow } from "@/lib/articles";
import { isAgencySlug } from "@/lib/agencies";
import DashboardClient from "./_components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardV2Page() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  if (perms.keywordOnly) redirect("/keywords");
  const visible = visibleAgencies(perms);

  const sb = supabaseAdmin();
  const [articlesRes, unmatchedRes] = await Promise.all([
    sb
      .from("articles")
      .select(
        "id,publish_date,agency,slug,person_name,title,source_path,instagram_url,category,notes,created_at,updated_at,published_at,published_url,published_source",
      )
      .in("agency", visible.length > 0 ? visible : ["__none__"])
      .order("created_at", { ascending: false }),
    sb.from("unmatched_rss_items").select("agency", { count: "exact", head: true }),
  ]);

  if (articlesRes.error) {
    return <main className="p-6 text-red-700">DB 조회 실패: {articlesRes.error.message}</main>;
  }

  const articles = ((articlesRes.data || []) as ArticleRow[]).filter((a) => isAgencySlug(a.agency));
  const groups = groupArticlesForKanban(articles);
  const kpis = computeKpis(articles, unmatchedRes.count ?? 0);

  return (
    <DashboardClient
      groups={groups}
      kpis={kpis}
      generatedAt={new Date().toISOString()}
      perms={perms}
    />
  );
}
