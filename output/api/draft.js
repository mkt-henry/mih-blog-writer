import { readFile } from "fs/promises";
import { dirname, join, normalize, sep } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = normalize(join(__dir, ".."));

function resolveDraftPath(rawPath) {
  const relativePath = String(rawPath || "원고_모아보기.html")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "");

  if (!relativePath.endsWith(".html") || relativePath.includes("\0")) {
    return null;
  }

  const targetPath = normalize(join(OUTPUT_DIR, relativePath));
  if (!targetPath.startsWith(OUTPUT_DIR + sep)) {
    return null;
  }

  return targetPath;
}

export async function GET(request) {
  const url = new URL(request.url);
  const targetPath = resolveDraftPath(url.searchParams.get("path"));
  if (!targetPath) {
    return new Response("Invalid draft path.", { status: 400 });
  }

  try {
    const html = await readFile(targetPath, "utf8");
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch {
    return new Response("Draft not found.", { status: 404 });
  }
}
