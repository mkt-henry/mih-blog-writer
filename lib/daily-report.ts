// 첫 화면(/) "오늘" — 매일 Discord 로 나가는 발행 현황·검색 노출 알림을 지금 시각 기준으로 만든다.
//
// 형식은 supabase/functions/daily-notify/index.ts 의 Discord 본문과 같아야 한다(Owner 2026-10-22:
// "디코 발송 양식 그대로"). 그쪽 형식을 바꾸면 여기도 같이 바꾼다. Deno 엣지 함수와 Next 가
// 같은 파일을 나눠 쓸 수 없어 순수 함수만 옮겨 왔다(네트워크·DB 없음 — 테스트는 tests/daily-report.test.ts).

import type { AlertPayload } from "./alert-format";

export const REPORT_AGENCIES = {
  mih_speaker: { label: "influence", blog: "gdfdhzgfgfhgdj" },
  mih_casting: { label: "캐스팅", blog: "mih_casting" },
  mih_agency: { label: "에이전시", blog: "mih_agency" },
  other: { label: "kyh620303", blog: "kyh620303" },
} as const;

export type ReportAgency = keyof typeof REPORT_AGENCIES;
export const REPORT_SLUGS = Object.keys(REPORT_AGENCIES) as ReportAgency[];

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  ts: number;
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const title =
      (body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? body.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? "";
    const rawLink = body.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? "";
    const link = rawLink.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
    const pubDate = body.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    if (title) items.push({ title, link, pubDate, ts: pubDate ? new Date(pubDate).getTime() : 0 });
  }
  return items;
}

const KST_OFFSET = 9 * 3600_000;
export const kstDateStr = (now: number, offsetDays = 0) =>
  new Date(now + KST_OFFSET + offsetDays * 86400_000).toISOString().slice(0, 10);
const kstTimeStr = (ts: number) => new Date(ts + KST_OFFSET).toISOString().slice(11, 16);
const isKstDay = (ts: number, day: string) => new Date(ts + KST_OFFSET).toISOString().slice(0, 10) === day;

/** "[안정환 강연 섭외] ..." → "안정환 강연" */
export function extractKeyword(title: string): string {
  const m = title.match(/^\[([^\]]+?)(?:\s+섭외)?\]/);
  return m ? m[1] : title.slice(0, 20);
}

export function searchUrl(keyword: string): string {
  return `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(`${keyword} 섭외`)}`;
}

export type RssByAgency = Partial<Record<ReportAgency, RssItem[]>>;

function itemsOn(rss: RssByAgency, slug: ReportAgency, day: string): RssItem[] {
  return (rss[slug] ?? []).filter((r) => r.ts && isKstDay(r.ts, day)).sort((a, b) => a.ts - b.ts);
}

export interface StatusReport {
  day: string;
  total: number;
  /** Discord 발행현황 채널에 나가는 메시지들(임베드 1개 + 발행이 있으면 키워드/블로그 URL 1개). */
  messages: AlertPayload[];
}

/** 발행 현황 — daily-notify 의 Discord 발행현황 본문과 같은 모양. */
export function buildStatusReport(rss: RssByAgency, rssErrors: string[], day: string, nowIso: string): StatusReport {
  const byAgency = Object.fromEntries(REPORT_SLUGS.map((s) => [s, itemsOn(rss, s, day)])) as Record<
    ReportAgency,
    RssItem[]
  >;
  const total = REPORT_SLUGS.reduce((n, s) => n + byAgency[s].length, 0);

  const rssField = REPORT_SLUGS.map((slug) => {
    const items = byAgency[slug];
    if (items.length === 0) return null;
    const lines = items
      .map((r) => {
        const t = r.title.length > 30 ? r.title.slice(0, 30) + "…" : r.title;
        return `  \`${kstTimeStr(r.ts)}\` ${t}`;
      })
      .join("\n");
    return `**[${REPORT_AGENCIES[slug].label}]**\n${lines}`;
  })
    .filter(Boolean)
    .join("\n\n");

  const fields = [
    { name: `📡 오늘 발행 (${total}건)`, value: (rssField || "아직 발행된 원고가 없습니다.").slice(0, 1024), inline: false },
  ];
  if (rssErrors.length > 0) {
    fields.push({ name: "⚠️ RSS 수집 오류", value: rssErrors.join("\n").slice(0, 512), inline: false });
  }
  const messages: AlertPayload[] = [
    {
      embeds: [
        {
          title: `📋 MIH 발행 현황 · ${day}`,
          color: 0x1565c0,
          fields,
          footer: { text: "MIH Blog Writer · 매일 12:00 KST" },
          timestamp: nowIso,
        },
      ],
    },
  ];
  if (total > 0) {
    const all = REPORT_SLUGS.flatMap((s) => byAgency[s]).sort((a, b) => a.ts - b.ts);
    const keywordLines = all.map((r) => `${extractKeyword(r.title)} 섭외\n${r.link}`);
    messages.push({ content: [`▶ ${day}`, ...keywordLines].join("\n\n") });
  }
  return { day, total, messages };
}

export interface SearchRow {
  keyword: string;
  url: string;
  agency: ReportAgency;
  title: string;
}

export interface SearchReport {
  day: string;
  rows: SearchRow[];
  /** Discord 검색노출 채널 본문. 그날 발행이 없으면 null(Discord 로도 안 나간다). */
  message: AlertPayload | null;
}

/** 검색 노출 — 그날 발행한 키워드의 네이버 블로그 검색 주소. daily-notify 의 Discord 검색노출 본문과 같은 모양. */
export function buildSearchReport(rss: RssByAgency, day: string): SearchReport {
  const items = REPORT_SLUGS.flatMap((agency) => itemsOn(rss, agency, day).map((r) => ({ agency, r }))).sort(
    (a, b) => a.r.ts - b.r.ts,
  );
  const rows = items.map(({ agency, r }) => {
    const keyword = `${extractKeyword(r.title)} 섭외`;
    return { keyword, url: searchUrl(extractKeyword(r.title)), agency, title: r.title };
  });
  const message =
    rows.length > 0 ? { content: [`▶ ${day} 검색 노출`, ...rows.map((x) => x.url)].join("\n\n") } : null;
  return { day, rows, message };
}
