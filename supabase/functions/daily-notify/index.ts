// MIH 발행 현황 AIStudio + Discord 알림 (Supabase Edge Function)
//
// 4개 블로그(gdfdhzgfgfhgdj=influence / mih_casting / mih_agency / kyh620303)의 네이버 RSS를 동시에 fetch해서
// KST 기준으로 AIStudio 알림 두 개를 남긴다(2026-10-05 Discord 에서 옮김).
//   1) 발행 현황 — 당일 발행 현황 + 키워드/블로그 URL (푸시)
//   2) 검색 노출 쿼리 — 전일 발행 키워드의 네이버 블로그 검색 쿼리 URL (알림함에만, 푸시는 검색 노출 확인 요약이 한다)
//
// 2026-10-06 Owner: "당분간은 mih 는 디코로도 알림이 왔으면 좋겠어" — Discord 도 예전(PR #23 전) 형식 그대로 같이 보낸다.
// 지우지 말 것. 끌 때는 비밀값을 지우면 그 채널만 꺼진다(코드에 웹훅 주소를 두지 않는다, 공개 저장소다):
//   DISCORD_WEBHOOK_URL         — 발행현황 채널 (임베드 + 키워드/블로그 URL)
//   DISCORD_SEARCH_WEBHOOK_URL  — 검색노출 채널 (전일 발행 키워드 검색 쿼리)
// AIStudio 와 Discord 는 따로 보낸다: 한쪽이 실패해도 다른 쪽은 나간다(실패는 응답 errors 에 남고 ok:false).
// 본문 {"only":"discord"} 면 Discord 만, {"only":"aistudio"} 면 AIStudio 만 보낸다(그날 것을 한쪽에만 다시 보낼 때).
//
// 정규 스케줄: Supabase pg_cron 잡 mih-daily-notify 가 매일 09:30 KST 에 이 함수를 부른다.
// 수동: 대시보드 "새로고침 및 알림 발송" 버튼(/api/daily-notify) 또는 GitHub Actions daily-notify.yml(RUN_ONCE=1, Supabase 가 막혔을 때).
// 본문 {"test": true} 면 발행 현황 알림을 "[테스트]" 제목·푸시 없이 한 번만 보낸다(연결 확인용, Discord 로는 보내지 않는다).
// GitHub Actions(RUN_ONCE) 에서는 env ONLY=discord|aistudio 로 같은 선택을 한다.
//
// 필요한 비밀값: AISTUDIO_NOTIFY_TOKEN (supabase secrets, 토큰 label mih-supabase). AISTUDIO_NOTIFY_URL 은 선택.
// Discord: DISCORD_WEBHOOK_URL, DISCORD_SEARCH_WEBHOOK_URL (supabase secrets / GitHub repo secrets). 없으면 그 채널은 건너뛴다.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NOTIFY_URL   = Deno.env.get("AISTUDIO_NOTIFY_URL") || "https://aistudio.bp-studio.com/api/hooks/notify";
const NOTIFY_TOKEN = Deno.env.get("AISTUDIO_NOTIFY_TOKEN") ?? "";
const SITE_URL     = "https://mih.bp-studio.com";

// Discord 웹훅 — 비밀값으로만 받는다. 비어 있으면 그 채널은 꺼진 것이다.
const DISCORD_STATUS = (Deno.env.get("DISCORD_WEBHOOK_URL") ?? "").trim();         // 발행현황 채널
const DISCORD_SEARCH = (Deno.env.get("DISCORD_SEARCH_WEBHOOK_URL") ?? "").trim();  // 검색노출 채널

const AGENCIES = {
  mih_speaker: { label: "influence" },
  mih_casting: { label: "캐스팅" },
  mih_agency:  { label: "에이전시" },
  other: { label: "kyh620303" },
} as const;

type AgencySlug = keyof typeof AGENCIES;
const SLUGS = Object.keys(AGENCIES) as AgencySlug[];
const BLOG_SLUGS: Record<AgencySlug, string> = {
  mih_speaker: "gdfdhzgfgfhgdj",
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

interface Notice {
  title: string;
  body?: string;
  level?: "info" | "success" | "warning" | "error";
  url?: string;
  dedupe_key?: string;
  dedupe_minutes?: number;
  push?: boolean;
}

async function notifyAistudio(notice: Notice) {
  if (!NOTIFY_TOKEN) throw new Error("AISTUDIO_NOTIFY_TOKEN 비밀값이 없습니다");
  const res = await fetch(NOTIFY_URL, {
    method:  "POST",
    headers: { Authorization: `Bearer ${NOTIFY_TOKEN}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ ...notice, body: notice.body?.slice(0, 4000) }),
    signal:  AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`AIStudio 알림 실패: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function postDiscord(webhook: string, body: unknown) {
  const res = await fetch(webhook, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Discord 전송 실패: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

/** 메시지 한 개는 2000자까지라 넘으면 블록 단위로 나눠 여러 개로 보낸다(예전엔 넘으면 실패했다). */
function discordChunks(header: string, blocks: string[]): string[] {
  const out: string[] = [];
  let cur = header;
  for (const b of blocks) {
    if (cur.length + 2 + b.length > 2000 && cur !== header) {
      out.push(cur);
      cur = b;
    } else {
      cur = cur === header ? `${header}\n\n${b}` : `${cur}\n\n${b}`;
    }
  }
  out.push(cur.slice(0, 2000));
  return out;
}

type Only = "aistudio" | "discord" | null;

async function notify(req?: Request): Promise<Response> {
  let test = false;
  let only: Only = null;
  const pickOnly = (v: unknown): Only => (v === "aistudio" || v === "discord" ? v : null);
  if (req && req.method === "POST") {
    try {
      const b = await req.json();
      test = b?.test === true;
      only = pickOnly(b?.only);
    } catch { /* 빈 본문 = 보통 실행 */ }
  } else if (!req) {
    only = pickOnly(Deno.env.get("ONLY"));
  }
  const toAistudio = only !== "discord";
  const toDiscord  = only !== "aistudio" && !test;

  // 채널마다 따로 보낸다. 하나가 실패해도 나머지는 보낸다.
  const sendErrors: string[] = [];
  const sent: string[] = [];
  const attempt = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      sent.push(name);
    } catch (e) {
      sendErrors.push(`${name}: ${(e as Error).message}`);
    }
  };

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

  // ── 1) 발행 현황 — 당일 발행 현황 + 키워드/블로그 URL ─────────────────────────
  const publishedToday: Record<AgencySlug, RssItem[]> = {} as Record<AgencySlug, RssItem[]>;
  for (const slug of SLUGS) publishedToday[slug] = itemsOn(slug, today);
  const total = SLUGS.reduce((s, slug) => s + publishedToday[slug].length, 0);

  const perAccount = SLUGS
    .map((slug) => {
      const items = publishedToday[slug];
      if (items.length === 0) return null;
      const lines = items.map((r) => {
        const t = r.title.length > 30 ? r.title.slice(0, 30) + "…" : r.title;
        return `- \`${kstTimeStr(r.ts)}\` ${t}`;
      }).join("\n");
      return `**[${AGENCIES[slug].label}]**\n${lines}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const sections = [perAccount || "아직 발행된 원고가 없습니다."];
  if (rssErrors.length > 0) {
    sections.push(`**⚠️ RSS 수집 오류**\n${rssErrors.map((e) => `- ${e}`).join("\n")}`);
  }
  if (total > 0) {
    const all = SLUGS.flatMap((slug) => publishedToday[slug]).sort((a, b) => a.ts - b.ts);
    sections.push(`**▶ ${today}**\n${all.map((r) => `- ${extractKeyword(r.title)} 섭외 · ${r.link}`).join("\n")}`);
  }

  if (toAistudio) await attempt("aistudio:status", () => notifyAistudio({
    title:          `${test ? "[테스트] " : ""}📋 MIH 발행 현황 · ${today} · ${total}건`,
    body:           sections.join("\n\n"),
    level:          rssErrors.length > 0 ? "warning" : total > 0 ? "success" : "info",
    url:            SITE_URL,
    // 같은 날 다시 보내면(대시보드 버튼) 새 알림 대신 그날 알림을 고쳐 맨 위로 올린다.
    dedupe_key:     test ? `mih-daily-test-${today}` : `mih-daily-status-${today}`,
    dedupe_minutes: 1440,
    ...(test ? { push: false } : {}),
  }));

  // Discord 발행현황 채널 — PR #23 전 discord-notify 와 같은 형식(임베드 + 키워드/블로그 URL 메시지).
  if (toDiscord && DISCORD_STATUS) {
    await attempt("discord:status", async () => {
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
        { name: `📡 오늘 발행 (${total}건)`, value: (rssField || "아직 발행된 원고가 없습니다.").slice(0, 1024), inline: false },
      ];
      if (rssErrors.length > 0) {
        fields.push({ name: "⚠️ RSS 수집 오류", value: rssErrors.join("\n").slice(0, 512), inline: false });
      }
      await postDiscord(DISCORD_STATUS, {
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
        for (const content of discordChunks(`▶ ${today}`, lines)) await postDiscord(DISCORD_STATUS, { content });
      }
    });
  }

  // ── 2) 검색 노출 쿼리 — 전일 발행 키워드 검색 쿼리 (알림함에만) ───────────────
  const publishedYesterday = SLUGS.flatMap((slug) => itemsOn(slug, yesterday))
    .sort((a, b) => a.ts - b.ts);

  if (!test && toAistudio && publishedYesterday.length > 0) {
    const queryLines = publishedYesterday.map((r) => {
      const kw = `${extractKeyword(r.title)} 섭외`;
      return `- [${kw}](https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)})`;
    });
    await attempt("aistudio:search", () => notifyAistudio({
      title:          `🔎 MIH 검색 노출 쿼리 · ${yesterday} · ${publishedYesterday.length}건`,
      body:           queryLines.join("\n"),
      level:          "info",
      dedupe_key:     `mih-daily-search-${yesterday}`,
      dedupe_minutes: 1440,
      push:           false,
    }));
  }

  // Discord 검색노출 채널 — 예전과 같은 텍스트(검색 쿼리 URL 목록).
  if (toDiscord && DISCORD_SEARCH && publishedYesterday.length > 0) {
    const queryLines = publishedYesterday.map((r) => {
      const kw = extractKeyword(r.title);
      return `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw + " 섭외")}`;
    });
    await attempt("discord:search", async () => {
      for (const content of discordChunks(`▶ ${yesterday} 검색 노출`, queryLines)) await postDiscord(DISCORD_SEARCH, { content });
    });
  }

  const ok = sendErrors.length === 0;
  return new Response(
    JSON.stringify({
      ok, test, only, today, total, yesterday, yesterdayCount: publishedYesterday.length,
      sent, errors: rssErrors, sendErrors,
      ...(ok ? {} : { error: sendErrors.join(" / ") }),
      discord: { status: Boolean(DISCORD_STATUS), search: Boolean(DISCORD_SEARCH) },
    }),
    { status: ok ? 200 : 502, headers: { "Content-Type": "application/json" } },
  );
}

if (Deno.env.get("RUN_ONCE")) {
  const res = await notify();
  console.log(await res.text());
  if (!res.ok) Deno.exit(1);
} else {
  Deno.serve(async (req) => {
    try {
      return await notify(req);
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
  });
}
