import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 기존 output/keywords.html을 그대로 서빙.
// manifest.js 의존성만 동적 /api/manifest.js 로 치환.
export async function GET() {
  let html: string;
  try {
    html = readFileSync(join(process.cwd(), "output", "keywords.html"), "utf8");
  } catch (e) {
    return new Response(
      `<p style="font-family:sans-serif;padding:24px">keywords.html을 찾지 못했습니다: ${
        e instanceof Error ? e.message : String(e)
      }</p>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // 1) <script src="manifest.js?v=..."></script> → <script src="/api/manifest.js"></script>
  html = html.replace(
    /<script src="manifest\.js[^"]*"><\/script>/,
    '<script src="/api/manifest.js"></script>'
  );
  // 2) fetch('/manifest.js?_=...') → fetch('/api/manifest.js?_=...')
  html = html.replace(/fetch\(['"]\/manifest\.js/g, "fetch('/api/manifest.js");
  // 3) 모아보기로의 deeplink: index.html?path=... 또는 동일 폴더의 링크 → /?path=...
  //    keywords.html에서 .href='index.html?path=' 또는 location.href='index.html...' 같은 패턴
  html = html.replace(/['"]index\.html\?/g, '"/?');
  html = html.replace(/['"]index\.html['"]/g, '"/"');
  html = html.replace(/['"]rss\.html['"]/g, '"/rss"');

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
