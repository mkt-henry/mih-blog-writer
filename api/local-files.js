import { readdirSync, statSync } from "fs";
import { join } from "path";
import { supabase } from "../lib/db.js";
import { json } from "../lib/agency.js";

const OUTPUT_DIR = join(process.cwd(), "output");

function parseFileName(filename) {
  const withoutExt = filename.slice(0, -5);
  const idx = withoutExt.indexOf("_");
  if (idx === -1) return null;
  return {
    slug: withoutExt.slice(0, idx),
    title: withoutExt.slice(idx + 1)
  };
}

function listFiles() {
  const result = [];
  let entries;
  try {
    entries = readdirSync(OUTPUT_DIR);
  } catch {
    return result;
  }
  for (const entry of entries) {
    const fullPath = join(OUTPUT_DIR, entry);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }
    if (!stat.isDirectory()) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
    let files;
    try { files = readdirSync(fullPath); } catch { continue; }
    for (const file of files) {
      if (!file.endsWith(".html")) continue;
      const parsed = parseFileName(file);
      if (!parsed) continue;
      result.push({
        date: entry,
        file_path: `${entry}/${file}`,
        title: parsed.title,
        slug: parsed.slug
      });
    }
  }
  return result.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.file_path.localeCompare(b.file_path);
  });
}

export async function GET() {
  const files = listFiles();
  if (!files.length) return json([]);

  const filePaths = files.map(f => f.file_path);
  const { data: rows, error } = await supabase
    .from("manuscripts")
    .select("file_path, agency_id")
    .in("file_path", filePaths);

  if (error) return json({ error: error.message }, { status: 500 });

  const agencyIds = [...new Set((rows || []).map(r => r.agency_id).filter(Boolean))];
  let idToSlug = new Map();
  if (agencyIds.length) {
    const { data: agencies } = await supabase
      .from("agencies")
      .select("id, slug")
      .in("id", agencyIds);
    idToSlug = new Map((agencies || []).map(a => [a.id, a.slug]));
  }

  const byPath = new Map();
  for (const row of rows || []) {
    const slug = idToSlug.get(row.agency_id);
    if (!slug) continue;
    if (!byPath.has(row.file_path)) byPath.set(row.file_path, []);
    byPath.get(row.file_path).push(slug);
  }

  return json(files.map(f => ({ ...f, uploaded_to: byPath.get(f.file_path) || [] })));
}
