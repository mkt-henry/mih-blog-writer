"use client";

import type { RssStats } from "@/lib/rss-stats";
import type { AgencySlug } from "@/lib/agencies";
import RangePicker from "./RangePicker";
import KpiCards from "./KpiCards";
import AgencyChart from "./AgencyChart";
import DiagnosticList from "./DiagnosticList";
import PublishHeatmap from "./PublishHeatmap";
import ActionsBar from "./ActionsBar";

type UnmatchedItem = { agency: AgencySlug; title: string; link: string; pub_ts: number; last_seen_at: string };

type Props = {
  days: number;
  stats: RssStats;
  unmatchedSample: UnmatchedItem[];
};

export default function RssClient({ days, stats, unmatchedSample }: Props) {
  return (
    <div className="min-h-screen bg-[color:var(--color-muted)]">
      <header className="bg-white border-b border-[color:var(--color-border)] px-4 py-2.5 flex items-center gap-3">
        <a href="/" className="text-sm text-gray-600 hover:text-gray-900">← 모아보기</a>
        <h1 className="text-sm font-bold flex-1">발행 현황</h1>
        <ActionsBar />
      </header>

      <div className="px-4 py-3 bg-white border-b border-[color:var(--color-border)] flex items-center gap-3">
        <RangePicker days={days} />
        <span className="text-xs text-gray-500">최근 {days}일</span>
      </div>

      <KpiCards stats={stats} days={days} />

      <div className="grid grid-cols-[1fr_360px] gap-3 p-4">
        <div className="bg-white border border-[color:var(--color-border)] rounded-lg p-4">
          <h2 className="text-sm font-bold mb-2">계정별 일자 발행 추이</h2>
          <AgencyChart daily={stats.daily} />
        </div>
        <div className="bg-white border border-[color:var(--color-border)] rounded-lg p-4">
          <h2 className="text-sm font-bold mb-2">점검 필요 항목</h2>
          <DiagnosticList stats={stats} unmatchedSample={unmatchedSample} />
        </div>
      </div>

      <div className="p-4">
        <div className="bg-white border border-[color:var(--color-border)] rounded-lg p-4">
          <h2 className="text-sm font-bold mb-2">{days}일 히트맵</h2>
          <PublishHeatmap daily={stats.daily} />
        </div>
      </div>
    </div>
  );
}
