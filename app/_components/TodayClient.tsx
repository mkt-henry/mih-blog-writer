"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { alertText, stripMarkdown } from "@/lib/alert-format";
import { REPORT_AGENCIES, type SearchReport, type StatusReport } from "@/lib/daily-report";
import { Content, CopyButton, kst } from "./DiscordMessage";

type Tab = "status" | "search";

type Props = {
  status: StatusReport;
  searchYesterday: SearchReport;
  searchToday: SearchReport;
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

function SearchTab({ yesterday, today }: { yesterday: SearchReport; today: SearchReport }) {
  const [day, setDay] = useState<"yesterday" | "today">("yesterday");
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
        {chip("yesterday", "어제", yesterday)}
        {chip("today", "오늘", today)}
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
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium text-[#0068E0] hover:underline"
              >
                <span className="truncate">{row.keyword}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              <CopyButton text={row.url} label="링크 복사" />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-gray-400">키워드를 누르면 네이버 블로그 검색이 열립니다 · 복사는 검색 링크</p>
    </>
  );
}

export default function TodayClient({ status, searchYesterday, searchToday, rssErrors, generatedAt }: Props) {
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

  return (
    <main className="mx-auto max-w-2xl px-3 py-4 pb-16">
      <div className="mb-2 flex items-center gap-2">
        <h1 className="whitespace-nowrap text-lg font-bold">오늘</h1>
        <span className="text-xs text-gray-500">{status.day} · {kst(generatedAt).split(" ")[1]} 기준</span>
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

      {tab === "status" ? <StatusTab status={status} /> : <SearchTab yesterday={searchYesterday} today={searchToday} />}
    </main>
  );
}
