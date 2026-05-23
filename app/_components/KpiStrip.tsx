import type { KanbanKpis } from "@/lib/articles";

type Props = { kpis: KanbanKpis };

const ITEMS: { key: keyof KanbanKpis; label: string; suffix?: string; tone: string }[] = [
  { key: "poolTotal", label: "대기 풀", suffix: "건", tone: "text-[color:var(--color-primary)]" },
  { key: "todayTotal", label: "오늘 발행", suffix: "/ 10 목표", tone: "text-[color:var(--color-agency)]" },
  { key: "weekTotal", label: "이번 주", suffix: "건", tone: "text-purple-700" },
  { key: "unmatchedNeedReview", label: "RSS 미매칭 ⚠", suffix: "확인 필요", tone: "text-[color:var(--color-warning)]" },
];

export default function KpiStrip({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 bg-white border-b border-[color:var(--color-border)]">
      {ITEMS.map(({ key, label, suffix, tone }) => (
        <div key={key} className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--color-text-muted)]">{label}</div>
          <div className={`text-xl font-bold ${tone}`}>
            {kpis[key]}
            {suffix && <span className="ml-1 text-xs font-medium text-[color:var(--color-text-muted)]">{suffix}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
