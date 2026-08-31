import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
import SearchForm from "./_components/SearchForm";
import QueryList from "./_components/QueryList";
import ResultList from "./_components/ResultList";
import DocPanel from "./_components/DocPanel";

export const dynamic = "force-dynamic";

export type Doc = {
  url: string;
  blog_id: string | null;
  title: string | null;
  char_len: number | null;
  is_ours: boolean | null;
  body?: string | null;
};
export type Ranked = Doc & { rank: number };
export type QueryHit = { query: string; count: number };

const CHECK_LIMIT = 40;   // 검색어 후보는 한 화면에 보일 만큼만

type Search = { q?: string; s?: string; doc?: string };

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  if (perms.keywordOnly) redirect("/keywords");

  const sp = await searchParams;
  const term = (sp.s ?? "").trim();
  const query = (sp.q ?? "").trim();
  const docUrl = (sp.doc ?? "").trim();
  const sb = supabaseAdmin();

  // ── 검색어 후보 ──────────────────────────────────────────────────────────
  // 수집분은 note='harvest' 로 들어가 있다(우리 발행분 노출 측정과 섞으면 안 된다).
  let queries: QueryHit[] = [];
  {
    let q = sb
      .from("mih_serp_checks")
      .select("query,competitors")
      .eq("note", "harvest")
      .order("query", { ascending: true })
      .limit(CHECK_LIMIT);
    if (term) q = q.ilike("query", `%${term}%`);
    const { data } = await q;
    queries = (data ?? []).map((r) => ({
      query: r.query as string,
      count: Array.isArray(r.competitors) ? r.competitors.length : 0,
    }));
  }

  // ── 선택한 검색어의 상위 노출 글 ──────────────────────────────────────────
  let ranked: Ranked[] = [];
  if (query) {
    const { data: chk } = await sb
      .from("mih_serp_checks")
      .select("competitors")
      .eq("note", "harvest")
      .eq("query", query)
      .limit(1)
      .maybeSingle();

    const entries = (Array.isArray(chk?.competitors) ? chk!.competitors : []) as Array<{
      rank: number;
      url: string;
    }>;
    const urls = entries.map((e) => String(e.url).split("?")[0].replace(/\/$/, ""));

    if (urls.length) {
      const { data: docs } = await sb
        .from("mih_serp_docs")
        .select("url,blog_id,title,char_len,is_ours")
        .in("url", urls);
      const byUrl = new Map((docs ?? []).map((d) => [d.url, d as Doc]));
      ranked = entries.map((e) => {
        const u = String(e.url).split("?")[0].replace(/\/$/, "");
        const d = byUrl.get(u);
        return {
          rank: e.rank,
          url: u,
          blog_id: d?.blog_id ?? u.split("/")[3] ?? null,
          title: d?.title ?? null,
          char_len: d?.char_len ?? null,
          is_ours: d?.is_ours ?? null,
        };
      });
    }
  }

  // ── 제목 검색 (검색어를 안 고른 경우) ─────────────────────────────────────
  let titleHits: Doc[] = [];
  if (term && !query) {
    const { data } = await sb
      .from("mih_serp_docs")
      .select("url,blog_id,title,char_len,is_ours")
      .ilike("title", `%${term}%`)
      .not("title", "is", null)
      .order("char_len", { ascending: false })
      .limit(60);
    titleHits = (data ?? []) as Doc[];
  }

  // ── 본문 ────────────────────────────────────────────────────────────────
  let doc: Doc | null = null;
  if (docUrl) {
    const { data } = await sb
      .from("mih_serp_docs")
      .select("url,blog_id,title,char_len,is_ours,body")
      .eq("url", docUrl)
      .limit(1)
      .maybeSingle();
    doc = (data as Doc) ?? null;
  }

  const { count: total } = await sb
    .from("mih_serp_docs")
    .select("*", { count: "exact", head: true })
    .not("body", "is", null);

  return (
    <div className="min-h-screen bg-[color:var(--color-muted)]">
      <div className="px-4 py-3 bg-white border-b border-[color:var(--color-border)] flex items-center gap-3 flex-wrap">
        <SearchForm term={term} />
        <span className="text-xs text-gray-500">
          수집한 경쟁 글 {(total ?? 0).toLocaleString()}건
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-3 p-4">
        <QueryList queries={queries} term={term} active={query} limit={CHECK_LIMIT} />
        <div className="min-w-0 flex flex-col gap-3">
          <ResultList
            query={query}
            term={term}
            ranked={ranked}
            titleHits={titleHits}
            activeDoc={docUrl}
          />
          {doc && <DocPanel doc={doc} />}
        </div>
      </div>
    </div>
  );
}
