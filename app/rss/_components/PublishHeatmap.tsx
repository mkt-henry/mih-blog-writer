import type { DailyBucket } from "@/lib/rss-stats";

type Props = { daily: DailyBucket[] };

function intensity(total: number): string {
  if (total === 0) return "bg-gray-100";
  if (total < 5) return "bg-blue-100";
  if (total < 8) return "bg-blue-300";
  if (total < 11) return "bg-blue-500";
  return "bg-blue-700";
}

export default function PublishHeatmap({ daily }: Props) {
  const cols = Math.min(daily.length, 14);
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {daily.map((d) => {
        const total = d.mih_speaker + d.mih_casting + d.mih_agency + d.other;
        const cls = intensity(total);
        return (
          <div
            key={d.date}
            title={`${d.date} · ${total}건 (S:${d.mih_speaker} / C:${d.mih_casting} / A:${d.mih_agency} / O:${d.other})`}
            className={`aspect-square rounded text-[9px] flex items-center justify-center ${cls} ${total >= 5 ? "text-white" : "text-gray-600"}`}
          >
            {total}
          </div>
        );
      })}
    </div>
  );
}
