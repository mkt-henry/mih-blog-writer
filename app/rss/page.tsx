import { supabaseAdmin } from "@/lib/supabase";
import { computeRssStats } from "@/lib/rss-stats";
import type { AgencySlug } from "@/lib/agencies";
import { isAgencySlug } from "@/lib/agencies";
import RssClient from "./_components/RssClient";

export const dynamic = "force-dynamic";

const KST_OFFSET_MS = 9 * 3600_000;
function kstMidnightMs(now = Date.now()): number {
  return Math.floor((now + KST_OFFSET_MS) / 86400_000) * 86400_000 - KST_OFFSET_MS;
}

type Search = { days?: string };

export default async function RssV2Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const days = Math.min(90, Math.max(7, parseInt(sp.days ?? "14", 10) || 14));

  const tomorrowStart = kstMidnightMs() + 86400_000;
  const startMs = tomorrowStart - days * 86400_000;
  const endMs = tomorrowStart;

  const sb = supabaseAdmin();
  const [aRes, uRes, recentUnmatched] = await Promise.all([
    sb.from("articles")
      .select("id,agency,created_at,published_at")
      .not("published_at", "is", null)
      .gte("published_at", new Date(startMs).toISOString())
      .lt("published_at", new Date(endMs).toISOString()),
    sb.from("unmatched_rss_items").select("agency", { count: "exact", head: true }),
    sb.from("unmatched_rss_items")
      .select("agency,title,link,pub_ts,last_seen_at")
      .order("pub_ts", { ascending: false })
      .limit(20),
  ]);

  if (aRes.error) return <main className="p-6 text-red-700">DB: {aRes.error.message}</main>;

  const articles = (aRes.data || []).filter((a) => isAgencySlug(a.agency)) as Array<{
    id: string; agency: AgencySlug; created_at: string; published_at: string;
  }>;

  const stats = computeRssStats({
    range: { startMs, endMs },
    articles: articles.map((a) => ({ id: a.id, agency: a.agency, created_at: a.created_at, published_at: a.published_at })),
    unmatchedCount: uRes.count ?? 0,
  });

  return (
    <RssClient
      days={days}
      stats={stats}
      unmatchedSample={(recentUnmatched.data ?? []) as { agency: AgencySlug; title: string; link: string; pub_ts: number; last_seen_at: string }[]}
    />
  );
}
