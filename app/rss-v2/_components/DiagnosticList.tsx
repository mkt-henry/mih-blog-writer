import type { RssStats } from "@/lib/rss-stats";
import type { AgencySlug } from "@/lib/agencies";

type UnmatchedItem = { agency: AgencySlug; title: string; link: string; pub_ts: number; last_seen_at: string };
type Props = { stats: RssStats; unmatchedSample: UnmatchedItem[] };

export default function DiagnosticList({ stats, unmatchedSample }: Props) {
  return (
    <div className="space-y-2 text-xs">
      {stats.zeroDaysCount > 0 && (
        <Alert tone="bad" title={`${stats.zeroDaysCount}일 발행 0건`} sub="하루 0건으로 떨어진 날 — 의도된 휴일이 아니면 점검" />
      )}
      {stats.unmatchedCount > 0 && (
        <Alert tone="warn" title={`RSS에 있으나 DB에 없음 ${stats.unmatchedCount}건`} sub="네이버에서 직접 작성됐을 가능성. 아래 샘플 참고." />
      )}
      {stats.zeroDaysCount === 0 && stats.unmatchedCount === 0 && (
        <Alert tone="ok" title="이상 없음" sub="이 기간에 점검할 항목이 없습니다" />
      )}
      {unmatchedSample.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wide">최근 미매칭 샘플</div>
          {unmatchedSample.slice(0, 5).map((u) => (
            <a key={u.link} href={u.link} target="_blank" rel="noopener" className="block py-1 hover:bg-gray-50 rounded px-1">
              <div className="text-xs text-gray-800 truncate">{u.title}</div>
              <div className="text-[10px] text-gray-400">{u.agency} · {new Date(u.pub_ts).toLocaleString("ko-KR")}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Alert({ tone, title, sub }: { tone: "ok" | "warn" | "bad"; title: string; sub: string }) {
  const cls =
    tone === "ok" ? "bg-green-50 border-green-200 text-green-900" :
    tone === "warn" ? "bg-yellow-50 border-yellow-200 text-yellow-900" :
    "bg-red-50 border-red-200 text-red-900";
  return (
    <div className={`rounded-md border px-3 py-2 ${cls}`}>
      <div className="font-semibold text-xs">{title}</div>
      <div className="text-[10px] opacity-80 mt-0.5">{sub}</div>
    </div>
  );
}
