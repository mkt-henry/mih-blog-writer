"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, EyeOff, RefreshCw } from "lucide-react";
import { alertText, stripMarkdown } from "@/lib/alert-format";
import { REPORT_AGENCIES, type SearchReport, type SearchRow, type StatusReport } from "@/lib/daily-report";
import { performanceCounts, performanceText, rankLabel, type RankValue } from "@/lib/performance-summary";
import { isAndroid, secretAppIntent, serpPath } from "@/lib/secret-app";
import { Content, CopyButton, kst } from "./DiscordMessage";

type Tab = "status" | "search";

type Props = {
  /** 보고 있는 날짜 YYYY-MM-DD (주소 ?date=, 없으면 오늘) */
  day: string;
  today: string;
  status: StatusReport;
  searchYesterday: SearchReport;
  searchToday: SearchReport;
  /** 네이버가 주는 최근 글 목록이 그날까지 닿지 않아 일부 글이 빠졌을 수 있다 */
  rssPartial: boolean;
  rssErrors: string[];
  generatedAt: string;
};

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${
        active ? "bg-white text-[color:var(--color-primary)] shadow-sm" : "text-gray-500"
      }`}
    >
      {children}
    </button>
  );
}

// 발행 현황 탭: Discord 발행현황의 키워드/블로그 URL 메시지만 보인다(위 요약 임베드는 Owner 요청으로 뺐다, 2026-10-22).
function StatusTab({ status }: { status: StatusReport }) {
  const lists = status.messages.filter((m) => m.content);
  if (lists.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500">{status.day} 에 아직 발행된 원고가 없습니다.</p>;
  }
  return (
    <ul className="space-y-2">
      {lists.map((m, i) => (
        <li key={i} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-primary)] text-[10px] font-bold text-white">
              MIH
            </div>
            <span className="text-sm font-semibold">발행 현황</span>
            <div className="flex-1" />
            <CopyButton text={alertText(m)} label="전체 복사" />
          </div>
          <div className="pl-9 text-sm leading-relaxed text-gray-900">
            <Content text={m.content!} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// 검색 노출 목록 아래 성과 요약 (Owner 2026-10-31): 키워드마다 로그인 없이 본 통합검색 순위를 받아 모으고 한 번에 복사한다.
// 순위는 앱 검색 팝업 배지와 같은 수(화면의 검색 결과 순서, 광고 제외). 네이버를 한꺼번에 두드리지 않게 3개씩 받는다.
function PerformanceSummary({ day, rows }: { day: string; rows: SearchRow[] }) {
  const [ranks, setRanks] = useState<RankValue[]>([]);
  const [asOf, setAsOf] = useState("");
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;
    setRanks(rows.map(() => undefined));
    let next = 0;
    const worker = async () => {
      while (alive && next < rows.length) {
        const i = next++;
        let v: RankValue = "error";
        try {
          const res = await fetch(`/api/serp-rank?q=${encodeURIComponent(rows[i].keyword)}&post=${encodeURIComponent(rows[i].post)}`, {
            cache: "no-store",
          });
          if (res.ok) v = ((await res.json()) as { rank: number | null }).rank;
        } catch {}
        if (alive) setRanks((prev) => prev.map((x, j) => (j === i ? v : x)));
      }
    };
    Promise.all([worker(), worker(), worker()]).then(() => {
      if (alive) setAsOf(kst(new Date().toISOString()));
    });
    return () => {
      alive = false;
    };
  }, [rows, round]);

  const lines = rows.map((r, i) => ({ keyword: r.keyword, rank: ranks[i] }));
  const c = performanceCounts(lines);
  const loading = c.pending > 0;

  return (
    <section className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-bold">성과 요약</h2>
        <span className="text-[11px] text-gray-500">{loading ? `순위 확인 중 ${c.total - c.pending}/${c.total}` : `통합검색 · ${asOf} 기준`}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setRound((n) => n + 1)}
          disabled={loading}
          aria-label="순위 다시 확인"
          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
        {!loading && <CopyButton text={performanceText(day, lines, asOf)} label="요약 복사" />}
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1.5 text-center">
        {[
          ["노출", `${c.exposed}/${c.total}`],
          ["1위", `${c.top1}건`],
          ["3위 안", `${c.top3}건`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-gray-50 py-1.5">
            <div className="text-[11px] text-gray-500">{k}</div>
            <div className="text-base font-bold tabular-nums">{loading ? "…" : v}</div>
          </div>
        ))}
      </div>
      <ul className="space-y-0.5">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-gray-800">{l.keyword}</span>
            <span
              className={`shrink-0 tabular-nums ${
                typeof l.rank === "number"
                  ? l.rank <= 3
                    ? "font-bold text-[color:var(--color-primary)]"
                    : "font-semibold text-gray-800"
                  : "text-gray-400"
              }`}
            >
              {rankLabel(l.rank)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SearchTab({ yesterday, today, isToday }: { yesterday: SearchReport; today: SearchReport; isToday: boolean }) {
  const [day, setDay] = useState<"yesterday" | "today">("yesterday");
  // 안드로이드면 키워드를 "MIH 시크릿" 앱(로그인 없는 웹뷰)으로 연다. 서버 렌더와 어긋나지 않게 마운트 뒤에 정한다.
  const [appOrigin, setAppOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (isAndroid(navigator.userAgent)) setAppOrigin(window.location.origin);
  }, []);
  const r = day === "yesterday" ? yesterday : today;
  const chip = (key: "yesterday" | "today", label: string, rep: SearchReport) => (
    <button
      type="button"
      onClick={() => setDay(key)}
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
        day === key ? "bg-[color:var(--color-primary)] text-white" : "border border-gray-200 bg-white text-gray-600"
      }`}
    >
      {label} {rep.day.slice(5).replace("-", "/")} · {rep.rows.length}건
    </button>
  );

  return (
    <>
      <div className="mb-2 flex items-center gap-1.5">
        {chip("yesterday", isToday ? "어제" : "전날", yesterday)}
        {chip("today", isToday ? "오늘" : "그날", today)}
        <div className="flex-1" />
        {r.message?.content && <CopyButton text={stripMarkdown(r.message.content)} label="전체 복사" />}
      </div>
      {r.rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">{r.day} 에 발행된 글이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {r.rows.map((row, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-2.5">
              <div className="w-[4.5rem] shrink-0 leading-tight">
                <div className="truncate text-xs font-medium text-gray-700">{REPORT_AGENCIES[row.agency].label}</div>
                <div className="text-[11px] tabular-nums text-gray-500">{row.time} 발행</div>
              </div>
              {/* 로그인된 브라우저는 개인화로 우리 글이 위로 보여 시크릿(로그인 없는) 결과 화면으로 연다 (Owner 2026-10-22).
                  안드로이드는 앱의 시크릿 웹뷰로 실제 네이버 화면을 연다 — 앱이 없으면 크롬이 같은 /serp 로 넘어간다 (Owner 2026-10-25). */}
              {appOrigin ? (
                <a
                  href={secretAppIntent(row.keyword, row.post, appOrigin, r.rows, i)}
                  className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium text-[#0068E0] hover:underline"
                >
                  <span className="truncate">{row.keyword}</span>
                  <EyeOff className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <Link
                  href={serpPath(row.keyword, row.post)}
                  className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium text-[#0068E0] hover:underline"
                >
                  <span className="truncate">{row.keyword}</span>
                  <EyeOff className="h-3 w-3 shrink-0" />
                </Link>
              )}
              <CopyButton text={row.url} label="링크 복사" />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-gray-400">키워드를 누르면 로그인 없이 본(시크릿) 네이버 블로그 검색 순위가 열립니다 · 복사는 검색 링크</p>
      {r.rows.length > 0 && <PerformanceSummary key={`${r.day}`} day={r.day} rows={r.rows} />}
    </>
  );
}

// 날짜 하루 앞뒤로 옮기기 (YYYY-MM-DD, 시간대 영향 없게 UTC 로 계산)
const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

export default function TodayClient({ day, today, status, searchYesterday, searchToday, rssPartial, rssErrors, generatedAt }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("status");
  const [pending, startTransition] = useTransition();

  // 새로고침해도 보던 탭을 그대로 연다(?tab=search).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "search") setTab("search");
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "search") url.searchParams.set("tab", "search");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.pathname + url.search);
  };
  // 날짜 바꾸기 (Owner 2026-10-27): ?date= 로 서버가 그날 기준으로 다시 만든다. 보던 탭은 그대로 둔다.
  const isToday = day === today;
  const goDay = (d: string) => {
    if (!d || d === day) return;
    const url = new URL(window.location.href);
    if (d >= today) url.searchParams.delete("date");
    else url.searchParams.set("date", d);
    startTransition(() => router.push(url.pathname + url.search));
  };

  return (
    <main className="mx-auto max-w-2xl px-3 py-4 pb-16">
      <div className="mb-2 flex items-center gap-2">
        <h1 className="whitespace-nowrap text-lg font-bold">오늘</h1>
        <div className="flex items-center">
          <button type="button" onClick={() => goDay(shiftDay(day, -1))} aria-label="전날" className="rounded p-1 text-gray-500 hover:bg-gray-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={day}
            max={today}
            onChange={(e) => goDay(e.target.value)}
            aria-label="날짜"
            className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs tabular-nums text-gray-700"
          />
          <button
            type="button"
            onClick={() => goDay(shiftDay(day, 1))}
            disabled={isToday}
            aria-label="다음 날"
            className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {isToday ? (
          <span className="whitespace-nowrap text-xs text-gray-500">{kst(generatedAt).split(" ")[1]} 기준</span>
        ) : (
          <button type="button" onClick={() => goDay(today)} className="whitespace-nowrap rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">
            오늘로
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          aria-label="새로고침"
          className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
        <TabButton active={tab === "status"} onClick={() => pick("status")}>
          발행 현황 {status.total}
        </TabButton>
        <TabButton active={tab === "search"} onClick={() => pick("search")}>
          검색 노출 {searchYesterday.rows.length}
        </TabButton>
      </div>

      {rssErrors.length > 0 && (
        <p className="mb-2 text-xs text-red-600">일부 계정 글을 못 읽었습니다: {rssErrors.join(", ")}</p>
      )}

      {rssPartial && (
        <p className="mb-2 text-xs text-amber-700">이 날짜는 블로그 최근 글 목록 밖이라 일부 글이 빠졌을 수 있습니다.</p>
      )}

      {tab === "status" ? (
        <StatusTab status={status} />
      ) : (
        <SearchTab key={day} yesterday={searchYesterday} today={searchToday} isToday={isToday} />
      )}
    </main>
  );
}
