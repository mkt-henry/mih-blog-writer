import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { AGENCIES, isAgencySlug, BUSINESS_CARD_LINK_URL } from "@/lib/agencies";
import ArticleActions from "@/components/ArticleActions";

export const dynamic = "force-dynamic";

type Params = { date: string; agency: string; slug: string };

function buildBusinessCardHtml(agency: keyof typeof AGENCIES) {
  const a = AGENCIES[agency];
  const img = `<img src="${a.businessCardImageUrl}" width="${a.businessCardWidth}">`;
  const inner = BUSINESS_CARD_LINK_URL ? `<a href="${BUSINESS_CARD_LINK_URL}">${img}</a>` : img;
  return `<p align="center">${inner}</p>`;
}

function mergeWithBusinessCard(originalHtml: string, cardHtml: string) {
  if (!cardHtml) return originalHtml;
  if (!originalHtml) return cardHtml;
  const m = originalHtml.match(/<a\s[^>]*href=["']https:\/\/open\.kakao\.com\//i);
  if (m && typeof m.index === "number") {
    const pStart = originalHtml.lastIndexOf("<p ", m.index);
    if (pStart !== -1) {
      return originalHtml.slice(0, pStart) + cardHtml + "\n" + originalHtml.slice(pStart);
    }
  }
  return `${originalHtml}\n${cardHtml}`;
}

export default async function ArticlePage({ params }: { params: Promise<Params> }) {
  const { date, agency, slug } = await params;
  if (!isAgencySlug(agency)) notFound();

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("articles")
    .select("*")
    .eq("publish_date", date)
    .eq("agency", agency)
    .eq("slug", decodeURIComponent(slug))
    .maybeSingle();

  if (error) {
    return (
      <main style={{ padding: 24, color: "#b00" }}>DB 조회 실패: {error.message}</main>
    );
  }
  if (!data) notFound();

  const card = buildBusinessCardHtml(agency);
  const mergedHtml = mergeWithBusinessCard(data.html_content, card);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f8" }}>
      <header
        style={{
          padding: "12px 20px",
          background: "#fff",
          borderBottom: "1px solid #e3e5ea",
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <a href="/" style={{ fontSize: 12, color: "#888", textDecoration: "none", padding: "4px 10px", border: "1px solid #d8dbe1", borderRadius: 5 }}>
          ← 모아보기
        </a>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 14, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {data.title}
          </h2>
          <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
            {AGENCIES[agency].name} · {date}
          </div>
        </div>
        <ArticleActions title={data.title} html={mergedHtml} />
      </header>
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 24, background: "#fff", marginTop: 16, borderRadius: 8 }}>
        <div
          style={{ lineHeight: 1.6, color: "#222" }}
          dangerouslySetInnerHTML={{ __html: mergedHtml }}
        />
      </main>
    </div>
  );
}
