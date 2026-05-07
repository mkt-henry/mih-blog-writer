import { supabase } from "../lib/db.js";
import { json } from "../lib/agency.js";

function requireAdmin(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return token === process.env.ADMIN_TOKEN;
}

export async function GET() {
  const { data, error } = await supabase
    .from("agencies")
    .select("id, slug, name, kakao_url, business_card_image_url, business_card_width, rss_url, site_base_url, updated_at")
    .order("id");
  if (error) return json({ error: error.message }, { status: 500 });
  return json(data);
}

export async function POST(request) {
  if (!requireAdmin(request)) return json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { slug, name, kakao_url, business_card_image_url, business_card_width, rss_url, site_base_url } = body;
  if (!slug || !name) return json({ error: "slug and name are required" }, { status: 400 });

  const { data, error } = await supabase
    .from("agencies")
    .insert({ slug, name, kakao_url, business_card_image_url, business_card_width, rss_url, site_base_url })
    .select()
    .single();
  if (error) return json({ error: error.message }, { status: 500 });
  return json(data, { status: 201 });
}

export async function PUT(request) {
  if (!requireAdmin(request)) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const slug = url.searchParams.get("agency");
  if (!slug) return json({ error: "agency param required" }, { status: 400 });

  const body = await request.json();
  const { data, error } = await supabase
    .from("agencies")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("slug", slug)
    .select()
    .single();
  if (error) return json({ error: error.message }, { status: 500 });
  return json(data);
}
