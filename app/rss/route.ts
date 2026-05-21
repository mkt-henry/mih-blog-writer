import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 기존 output/rss.html을 그대로 서빙. manifest.js 의존성만 /api/manifest.js로 치환.
export async function GET() {
  let html: string;
  try {
    html = readFileSync(join(process.cwd(), "output", "rss.html"), "utf8");
  } catch (e) {
    return new Response(
      `<p style="font-family:sans-serif;padding:24px">rss.html을 찾지 못했습니다: ${
        e instanceof Error ? e.message : String(e)
      }</p>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  html = html.replace(
    /<script src="manifest\.js[^"]*"><\/script>/,
    '<script src="/api/manifest.js"></script>'
  );
  html = html.replace(/fetch\(['"]\/manifest\.js/g, "fetch('/api/manifest.js");
  html = html.replace(/['"]index\.html\?/g, '"/?');
  html = html.replace(/['"]index\.html['"]/g, '"/"');
  html = html.replace(/['"]keywords\.html['"]/g, '"/keywords"');

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
