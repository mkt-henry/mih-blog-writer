import { supabase } from "../lib/db.js";

async function getAgencyId(slug) {
  const { data } = await supabase.from("agencies").select("id").eq("slug", slug).single();
  return data?.id ?? null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const agencySlug = url.searchParams.get("agency");
  if (!agencySlug) return Response.json({ error: "agency param required" }, { status: 400 });

  const agencyId = await getAgencyId(agencySlug);
  if (!agencyId) return Response.json({ error: "Agency not found" }, { status: 404 });

  const filePath = url.searchParams.get("path");
  if (filePath) {
    const { data, error } = await supabase
      .from("manuscripts")
      .select("id, file_path, title, slug, date, created_at, updated_at")
      .eq("agency_id", agencyId)
      .eq("file_path", filePath)
      .single();
    if (error || !data) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(data);
  }

  const { data, error } = await supabase
    .from("manuscripts")
    .select("id, file_path, title, slug, date, created_at, updated_at")
    .eq("agency_id", agencyId)
    .order("date", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request) {
  const body = await request.json();
  const { agency, file_path, title, slug, date, html_content } = body;

  if (!agency || !file_path || !title || !html_content) {
    return Response.json({ error: "agency, file_path, title, html_content are required" }, { status: 400 });
  }

  const agencyId = await getAgencyId(agency);
  if (!agencyId) return Response.json({ error: "Agency not found" }, { status: 404 });

  const derivedSlug = slug || file_path.split("/").pop().split("_")[0];
  const derivedDate = date || file_path.split("/")[0];

  const { data, error } = await supabase
    .from("manuscripts")
    .upsert(
      { agency_id: agencyId, file_path, title: title.trim(), slug: derivedSlug, date: derivedDate, html_content, updated_at: new Date().toISOString() },
      { onConflict: "agency_id,file_path" }
    )
    .select("id, file_path, title, slug, date")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json();
  const { file_path, from_agency, to_agency } = body;
  if (!file_path || !from_agency || !to_agency) {
    return Response.json({ error: "file_path, from_agency, to_agency are required" }, { status: 400 });
  }

  const fromId = await getAgencyId(from_agency);
  const toId = await getAgencyId(to_agency);
  if (!fromId || !toId) return Response.json({ error: "Agency not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("manuscripts")
    .update({ agency_id: toId, updated_at: new Date().toISOString() })
    .eq("agency_id", fromId)
    .eq("file_path", file_path)
    .select("id, file_path, title, slug, date")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(request) {
  const url = new URL(request.url);
  const agencySlug = url.searchParams.get("agency");
  const filePath = url.searchParams.get("path");
  if (!agencySlug || !filePath) return Response.json({ error: "agency and path required" }, { status: 400 });

  const agencyId = await getAgencyId(agencySlug);
  if (!agencyId) return Response.json({ error: "Agency not found" }, { status: 404 });

  const { error } = await supabase
    .from("manuscripts")
    .delete()
    .eq("agency_id", agencyId)
    .eq("file_path", filePath);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
