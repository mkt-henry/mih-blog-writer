import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions, visibleAgencies } from "@/lib/permissions";
import { groupArticlesForKanban, computeKpis, type ArticleRow } from "@/lib/articles";
import { isAgencySlug } from "@/lib/agencies";
import DashboardClient from "./_components/DashboardClient";
import { fetchAll } from "@/lib/name-match.mjs";

export const dynamic = "force-dynamic";

export default async function DashboardV2Page() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  if (perms.keywordOnly) redirect("/keywords");
  const visible = visibleAgencies(perms);

  const sb = supabaseAdmin();
  // fetchAll: range 없이 조회하면 PostgREST 가 1000행만 돌려줘 원고 1100+ 중 일부가 통째로 빠진다.
  // (KPI 집계와 칸반에서 오래된 발행 대기 원고가 사라져 '작성 안 된 인물'처럼 보이는 원인)
  let articlesData: ArticleRow[];
  let unmatchedRes: { count: number | null };
  try {
    [articlesData, unmatchedRes] = await Promise.all([
      fetchAll<ArticleRow>(
        sb,
        "articles",
        "id,publish_date,agency,slug,person_name,title,source_path,instagram_url,category,notes,created_at,updated_at,published_at,published_url,published_source",
        (q) =>
          q
            .in("agency", visible.length > 0 ? visible : ["__none__"])
            .order("created_at", { ascending: false }),
      ),
      sb.from("unmatched_rss_items").select("agency", { count: "exact", head: true }),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return <main className="p-6 text-red-700">DB 조회 실패: {msg}</main>;
  }

  const articles = articlesData.filter((a) => isAgencySlug(a.agency));
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
