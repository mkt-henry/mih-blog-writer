import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
import { isAgencySlug, type AgencySlug } from "@/lib/agencies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ArticleRow = {
  id: string;
  publish_date: string;
  agency: AgencySlug;
  slug: string;
  person_name: string;
  title: string;
  html_content: string;
  source_path: string | null;
  created_at: string;
  updated_at: string;
};

export type ArticleSummary = Omit<ArticleRow, "html_content">;

// 기본은 본문 제외한 목록만. ?include=html 이면 본문 포함.
export async function GET(req: Request) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const perms = await loadPermissions(session.id, session.username);
  if (perms.keywordOnly) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const includeHtml = url.searchParams.get("include") === "html";
  const agency = url.searchParams.get("agency");

  const sb = supabaseAdmin();
  let query = sb
    .from("articles")
    .select(includeHtml ? "*" : "id, publish_date, agency, slug, person_name, title, source_path, created_at, updated_at")
    .order("publish_date", { ascending: false })
    .order("slug", { ascending: true });

  if (agency && isAgencySlug(agency)) {
    query = query.eq("agency", agency);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// publish-article.js 스크립트가 호출. 단일 원고 upsert.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const b = body as Partial<ArticleRow>;
  if (!b.publish_date || !b.agency || !b.slug || !b.title || !b.html_content) {
    return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
  }
  if (!isAgencySlug(b.agency)) {
    return NextResponse.json({ error: `잘못된 agency: ${b.agency}` }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("articles").upsert(
    {
      publish_date: b.publish_date,
      agency: b.agency,
      slug: b.slug,
      person_name: b.person_name ?? b.slug,
      title: b.title,
      html_content: b.html_content,
      source_path: b.source_path ?? null,
    },
    { onConflict: "publish_date,agency,slug" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
