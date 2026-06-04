// MIH 발행 현황 Discord 알림 (Supabase Edge Function)
//
// 4개 블로그(mih_speaker / mih_casting / mih_agency / kyh620303)의 네이버 RSS를 동시에 fetch해서
// KST 기준으로 두 채널에 메시지를 보낸다.
//   1) 발행현황 채널 — 당일 발행 현황 (임베드 + 키워드/블로그 URL)
//   2) 검색노출 채널 — 전일 발행 키워드의 네이버 블로그 검색 쿼리 URL
//
// pg_cron이 매일 09:30 KST에 net.http_post로 이 함수를 호출한다.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// 발행현황 채널 — 당일 발행 현황
const WEBHOOK_STATUS =
  Deno.env.get("DISCORD_WEBHOOK_URL") ??
  "https://discordapp.com/api/webhooks/1503361197087658076/flMPRAdb4rEle3eno1zLg_fpb7tQ9YEvmrOlqPlqqWbnfvnb6MO1TYajU77gBreIog1m";

// 검색노출 채널 — 전일 발행 키워드 검색 쿼리
const WEBHOOK_SEARCH =
  Deno.env.get("DISCORD_SEARCH_WEBHOOK_URL") ??
  "https://discordapp.com/api/webhooks/1508364799757783040/3SGZMQrStbeUjeFm7Y7dSOkNKgrEOuPzuXAtvfEfzIyFEIYeNVz9Cc0SmlVl18wfDWX-";

const AGENCIES = {
  mih_speaker: { label: "스피커", color: 0x1565c0 },
  mih_casting: { label: "캐스팅", color: 0x7b1fa2 },
  mih_agency:  { label: "에이전시", color: 0x2e7d32 },
  other: { label: "kyh620303", color: 0xe65100 },
} as const;

type AgencySlug = keyof typeof AGENCIES;
const SLUGS = Object.keys(AGENCIES) as AgencySlug[];
const BLOG_SLUGS: Record<AgencySlug, string> = {
  mih_speaker: "mih_speaker",
  mih_casting: "mih_casting",
  mih_agency: "mih_agency",
  other: "kyh620303",
};

interface RssItem {
  title:   string;
  link:    string;
  pubDate: string;
  ts:      number;
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body    = m[1];
    const title   = (body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? body.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? "";
    const rawLink = body.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? "";
    const link    = rawLink.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
    const pubDate = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    if (title) items.push({ title, link, pubDate, ts: pubDate ? new Date(pubDate).getTime() : 0 });
  }
  return items;
}

async function fetchRss(slug: AgencySlug): Promise<RssItem[]> {
  const blogSlug = BLOG_SLUGS[slug];
  const res = await fetch(`https://rss.blog.naver.com/${blogSlug}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MIH-Notifier/1.0)" },
    signal:  AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text());
}

const KST_OFFSET = 9 * 3600_000;
const kstDateStr  = (offsetDays = 0) => new Date(Date.now() + KST_OFFSET + offsetDays * 86400_000).toISOString().slice(0, 10);
const kstTimeStr  = (ts: number)     => new Date(ts + KST_OFFSET).toISOString().slice(11, 16);
const isKstDay    = (ts: number, day: string) => new Date(ts + KST_OFFSET).toISOString().slice(0, 10) === day;

function extractKeyword(title: string): string {
  // 예: "[안정환 강연 섭외] ..."  →  "안정환 강연"
  const m = title.match(/^\[([^\]]+?)(?:\s+섭외)?\]/);
  return m ? m[1] : title.slice(0, 20);
}

async function postJson(webhook: string, body: unknown) {
  const res = await fetch(webhook, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Discord 전송 실패: ${res.status} ${await res.text()}`);
}

Deno.serve(async () => {
  const today     = kstDateStr(0);
  const yesterday = kstDateStr(-1);

  // 계정별 RSS 전체를 한 번씩만 fetch해서 today / yesterday 둘 다 활용
  const rssItems: Record<AgencySlug, RssItem[]> = {} as Record<AgencySlug, RssItem[]>;
  const rssErrors: string[] = [];

  await Promise.all(
    SLUGS.map(async (slug) => {
      try {
        rssItems[slug] = await fetchRss(slug);
      } catch (e) {
        rssItems[slug] = [];
        rssErrors.push(`${AGENCIES[slug].label}: ${(e as Error).message}`);
      }
    }),
  );

  const itemsOn = (slug: AgencySlug, day: string) =>
    (rssItems[slug] ?? []).filter(r => r.ts && isKstDay(r.ts, day)).sort((a, b) => a.ts - b.ts);

  // ── 1) 발행현황 채널 — 당일 발행 현황 ───────────────────────────────────────
  const publishedToday: Record<AgencySlug, RssItem[]> = {} as Record<AgencySlug, RssItem[]>;
  for (const slug of SLUGS) publishedToday[slug] = itemsOn(slug, today);
  const total = SLUGS.reduce((s, slug) => s + publishedToday[slug].length, 0);

  const rssField = SLUGS
    .map((slug) => {
      const items = publishedToday[slug];
      if (items.length === 0) return null;
      const lines = items.map((r) => {
        const t = r.title.length > 30 ? r.title.slice(0, 30) + "…" : r.title;
        return `  \`${kstTimeStr(r.ts)}\` ${t}`;
      }).join("\n");
      return `**[${AGENCIES[slug].label}]**\n${lines}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const fields: { name: string; value: string; inline: boolean }[] = [
    {
      name:   `📡 오늘 발행 (${total}건)`,
      value:  (rssField || "아직 발행된 원고가 없습니다.").slice(0, 1024),
      inline: false,
    },
  ];

  if (rssErrors.length > 0) {
    fields.push({
      name:   "⚠️ RSS 수집 오류",
      value:  rssErrors.join("\n").slice(0, 512),
      inline: false,
    });
  }

  await postJson(WEBHOOK_STATUS, {
    embeds: [{
      title:     `📋 MIH 발행 현황 · ${today}`,
      color:     0x1565c0,
      fields,
      footer:    { text: "MIH Blog Writer · 매일 09:30 KST" },
      timestamp: new Date().toISOString(),
    }],
  });

  if (total > 0) {
    const all = SLUGS.flatMap((slug) => publishedToday[slug]).sort((a, b) => a.ts - b.ts);
    const lines = all.map((r) => `${extractKeyword(r.title)} 섭외\n${r.link}`);
    await postJson(WEBHOOK_STATUS, { content: `▶ ${today}\n\n${lines.join("\n\n")}` });
  }

  // ── 2) 검색노출 채널 — 전일 발행 키워드 검색 쿼리 ───────────────────────────
  const publishedYesterday = SLUGS.flatMap((slug) => itemsOn(slug, yesterday))
    .sort((a, b) => a.ts - b.ts);

  if (publishedYesterday.length > 0) {
    const queryLines = publishedYesterday.map((r) => {
      const kw = extractKeyword(r.title);
      return `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw + " 섭외")}`;
    });
    await postJson(WEBHOOK_SEARCH, { content: `▶ ${yesterday} 검색 노출\n\n${queryLines.join("\n\n")}` });
  }

  return new Response(
    JSON.stringify({ ok: true, today, total, yesterday, yesterdayCount: publishedYesterday.length, errors: rssErrors }),
    { headers: { "Content-Type": "application/json" } },
  );
});
