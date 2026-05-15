// MIH 발행 현황 Discord 알림 (Supabase Edge Function)
//
// 3개 블로그(mih_speaker / mih_casting / mih_agency)의 네이버 RSS를 동시에 fetch해서
// KST 기준 오늘 발행분을 집계하고 Discord 웹훅으로 두 건의 메시지를 보낸다.
//   1) 임베드 — 계정별 발행 목록 요약
//   2) 텍스트 — 키워드 + URL (발행이 있는 날만)
//
// pg_cron이 매일 10:00 KST에 net.http_post로 이 함수를 호출한다.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const WEBHOOK =
  Deno.env.get("DISCORD_WEBHOOK_URL") ??
  "https://discordapp.com/api/webhooks/1503361197087658076/flMPRAdb4rEle3eno1zLg_fpb7tQ9YEvmrOlqPlqqWbnfvnb6MO1TYajU77gBreIog1m";

const AGENCIES = {
  mih_speaker: { label: "스피커", color: 0x1565c0 },
  mih_casting: { label: "캐스팅", color: 0x7b1fa2 },
  mih_agency:  { label: "에이전시", color: 0x2e7d32 },
} as const;

type AgencySlug = keyof typeof AGENCIES;
const SLUGS = Object.keys(AGENCIES) as AgencySlug[];

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
  const res = await fetch(`https://rss.blog.naver.com/${slug}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MIH-Notifier/1.0)" },
    signal:  AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text());
}

const KST_OFFSET = 9 * 3600_000;
const kstDateStr = ()           => new Date(Date.now() + KST_OFFSET).toISOString().slice(0, 10);
const kstTimeStr = (ts: number) => new Date(ts + KST_OFFSET).toISOString().slice(11, 16);
const isKstToday = (ts: number, today: string) => new Date(ts + KST_OFFSET).toISOString().slice(0, 10) === today;

function extractKeyword(title: string): string {
  // 예: "[안정환 강연 섭외] ..."  →  "안정환 강연"
  const m = title.match(/^\[([^\]]+?)(?:\s+섭외)?\]/);
  return m ? m[1] : title.slice(0, 20);
}

async function postJson(body: unknown) {
  const res = await fetch(WEBHOOK, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Discord 전송 실패: ${res.status} ${await res.text()}`);
}

Deno.serve(async () => {
  const today = kstDateStr();

  const publishedToday: Record<AgencySlug, RssItem[]> = {} as Record<AgencySlug, RssItem[]>;
  const rssErrors: string[] = [];

  await Promise.all(
    SLUGS.map(async (slug) => {
      try {
        const items = await fetchRss(slug);
        publishedToday[slug] = items
          .filter(r => r.ts && isKstToday(r.ts, today))
          .sort((a, b) => a.ts - b.ts);
      } catch (e) {
        publishedToday[slug] = [];
        rssErrors.push(`${AGENCIES[slug].label}: ${(e as Error).message}`);
      }
    }),
  );

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

  await postJson({
    embeds: [{
      title:     `📋 MIH 발행 현황 · ${today}`,
      color:     0x1565c0,
      fields,
      footer:    { text: "MIH Blog Writer · 매일 10:00 KST" },
      timestamp: new Date().toISOString(),
    }],
  });

  if (total > 0) {
    const all = SLUGS.flatMap((slug) => publishedToday[slug].map((r) => ({ ...r, slug })))
      .sort((a, b) => a.ts - b.ts);
    const lines = all.map((r) => `${extractKeyword(r.title)} 섭외\n${r.link}`);
    await postJson({ content: `▶ ${today}\n\n${lines.join("\n\n")}` });
  }

  return new Response(
    JSON.stringify({ ok: true, date: today, total, errors: rssErrors }),
    { headers: { "Content-Type": "application/json" } },
  );
});
