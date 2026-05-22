import type { RssStats } from "@/lib/rss-stats";

type Props = { stats: RssStats; days: number };

export default function KpiCards({ stats, days }: Props) {
  const target = days * 10;
  return (
    <div className="grid grid-cols-4 gap-3 px-4 py-3">
      <Card label="기간 발행 합계" main={stats.totalPublished} sub={`하루 평균 ${(stats.totalPublished / days).toFixed(1)}건`} tone="text-[color:var(--color-agency)]" />
      <Card label="목표 달성률" main={`${stats.goalPercent}%`} sub={`${days}일 × 10건 = ${target} / 실 ${stats.totalPublished}`} tone="text-[color:var(--color-primary)]" />
      <Card label="RSS 미매칭 ⚠" main={stats.unmatchedCount} sub="DB에 없는 RSS 항목 — 확인 필요" tone="text-[color:var(--color-warning)]" />
      <Card label="발행 누락 의심" main={stats.zeroDaysCount} sub="하루 0건 발행된 날" tone="text-[color:var(--color-danger)]" />
    </div>
  );
}

function Card({ label, main, sub, tone }: { label: string; main: number | string; sub: string; tone: string }) {
  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-md px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${tone}`}>{main}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}
