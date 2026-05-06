const RSS_URL = "https://rss.blog.naver.com/mih_ent.xml";

function parseDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d)) return { date: "", time: "" };
  // pubDate includes +0900, so add 9h to UTC to recover KST wall clock
  const kst = new Date(d.getTime() + 9 * 3600000);
  return {
    date: kst.toISOString().slice(0, 10),
    time: kst.toISOString().slice(11, 16)
  };
}

function cleanUrl(raw) {
  let url = raw.trim();
  const cdata = url.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) url = cdata[1].trim();
  try {
    const u = new URL(url);
    u.searchParams.delete("fromRss");
    u.searchParams.delete("trackingCode");
    return u.origin + u.pathname + (u.search || "");
  } catch {
    return url;
  }
}

function parseRss(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
      block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>\s*([\s\S]*?)\s*<\/link>/);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!titleMatch || !linkMatch || !pubDateMatch) continue;
    const { date, time } = parseDate(pubDateMatch[1].trim());
    if (!date) continue;
    items.push({
      date,
      time,
      title: titleMatch[1].trim(),
      url: cleanUrl(linkMatch[1])
    });
  }
  return items;
}

export async function GET() {
  try {
    const res = await fetch(RSS_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; blog-reader/1.0)" },
      cache: "no-store"
    });
    if (!res.ok) {
      return Response.json({ error: `RSS fetch failed: ${res.status}` }, { status: 502 });
    }
    const xml = await res.text();
    const items = parseRss(xml);
    return new Response(JSON.stringify(items), {
      headers: {
        "content-type": "application/json",
        "cache-control": "s-maxage=300, stale-while-revalidate=60"
      }
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
