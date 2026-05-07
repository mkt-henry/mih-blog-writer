import { supabase } from "../lib/db.js";
import { json } from "../lib/agency.js";

function requireAdmin(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return token === process.env.ADMIN_TOKEN;
}

async function getAgencyId(slug) {
  const { data } = await supabase.from("agencies").select("id").eq("slug", slug).single();
  return data?.id ?? null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("agency");
  if (!slug) return json({ error: "agency param required" }, { status: 400 });

  const agencyId = await getAgencyId(slug);
  if (!agencyId) return json({ error: "Agency not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("published_posts")
    .select("id, url, title, date, published_at")
    .eq("agency_id", agencyId)
    .order("published_at", { ascending: false });

  if (error) return json({ error: error.message }, { status: 500 });
  return json(data);
}

export async function POST(request) {
  if (!requireAdmin(request)) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const slug = url.searchParams.get("agency");
  if (!slug) return json({ error: "agency param required" }, { status: 400 });

  const agencyId = await getAgencyId(slug);
  if (!agencyId) return json({ error: "Agency not found" }, { status: 404 });

  const body = await request.json();
  const posts = Array.isArray(body) ? body : [body];

  const rows = posts.map(p => ({
    agency_id: agencyId,
    url: p.url,
    title: p.title,
    date: p.date,
    published_at: p.published_at || p.publishedAt || `${p.date}T00:00:00+09:00`
  }));

  const { data, error } = await supabase
    .from("published_posts")
    .upsert(rows, { onConflict: "agency_id,url" })
    .select("id, url, title, date, published_at");

  if (error) return json({ error: error.message }, { status: 500 });
  return json(data, { status: 201 });
}

export async function DELETE(request) {
  if (!requireAdmin(request)) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const slug = url.searchParams.get("agency");
  const postUrl = url.searchParams.get("url");
  if (!slug || !postUrl) return json({ error: "agency and url params required" }, { status: 400 });

  const agencyId = await getAgencyId(slug);
  if (!agencyId) return json({ error: "Agency not found" }, { status: 404 });

  const { error } = await supabase
    .from("published_posts")
    .delete()
    .eq("agency_id", agencyId)
    .eq("url", postUrl);

  if (error) return json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
