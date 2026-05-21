import { supabaseAdmin } from "@/lib/supabase";
import HomeView, { type ManuscriptSummary } from "@/components/HomeView";
import { isAgencySlug } from "@/lib/agencies";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("articles")
    .select("id, publish_date, agency, slug, person_name, title, source_path")
    .order("publish_date", { ascending: false })
    .order("slug", { ascending: true });

  if (error) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui", color: "#b00" }}>
        DB 조회 실패: {error.message}
      </main>
    );
  }

  const manuscripts: ManuscriptSummary[] = (data || [])
    .filter((r) => isAgencySlug(r.agency))
    .map((r) => ({
      id: r.id,
      publish_date: r.publish_date,
      agency: r.agency,
      slug: r.slug,
      person_name: r.person_name,
      title: r.title,
      source_path: r.source_path,
    }));

  return <HomeView manuscripts={manuscripts} generatedAt={new Date().toISOString()} />;
}
