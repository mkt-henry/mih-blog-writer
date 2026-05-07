import { supabase } from "../lib/db.js";

function isValidDraftPath(rawPath) {
  const path = String(rawPath || "").replace(/\\/g, "/");
  return (
    path.endsWith(".html") &&
    !path.includes("\0") &&
    !path.startsWith("/") &&
    !path.includes("..")
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const rawPath = url.searchParams.get("path");
  const agencySlug = url.searchParams.get("agency") || "";

  if (!rawPath || !isValidDraftPath(rawPath)) {
    return new Response("Invalid draft path.", { status: 400 });
  }

  let query = supabase
    .from("manuscripts")
    .select("html_content")
    .eq("file_path", rawPath);

  if (agencySlug) {
    const { data: agency } = await supabase
      .from("agencies")
      .select("id")
      .eq("slug", agencySlug)
      .single();
    if (agency) query = query.eq("agency_id", agency.id);
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) return new Response("Draft not found.", { status: 404 });

  return new Response(data.html_content, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
