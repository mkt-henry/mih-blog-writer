import type { AgencySlug } from "@/lib/agencies";

type Article = {
  person_name: string;
  agency: AgencySlug;
  published_at: string;
  title: string;
  published_url: string;
};

const BADGE: Record<AgencySlug, string> = {
  mih_speaker: "bg-blue-50 text-blue-800",
  mih_casting: "bg-purple-50 text-purple-800",
  mih_agency:  "bg-green-50 text-green-800",
};

const LABEL: Record<AgencySlug, string> = {
  mih_speaker: "speaker",
  mih_casting: "casting",
  mih_agency:  "agency",
};

function toKSTDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  const y = String(d.getUTCFullYear()).slice(2);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function groupByDate(articles: Article[]): [string, Article[]][] {
  const map = new Map<string, Article[]>();
  for (const a of articles) {
    const key = toKSTDate(a.published_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return [...map.entries()];
}

export default function PublishedArticleList({ articles }: { articles: Article[] }) {
  if (articles.length === 0) {
    return <p className="text-xs text-gray-400 py-4 text-center">이 기간에 발행된 원고가 없습니다.</p>;
  }

  const groups = groupByDate(articles);

  return (
    <div className="divide-y divide-gray-100">
      {groups.map(([date, rows]) => (
        <div key={date}>
          <div className="sticky top-0 bg-gray-50 px-4 py-1.5 flex items-center gap-2 border-b border-gray-100 z-10">
            <span className="text-xs font-bold text-gray-600">{date}</span>
            <span className="text-[10px] text-gray-400">{rows.length}건</span>
          </div>
          {rows.map((a, i) => (
            <a
              key={i}
              href={a.published_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-baseline gap-2 px-4 py-2 hover:bg-gray-50 border-b border-gray-50 group"
            >
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${BADGE[a.agency]}`}>
                {LABEL[a.agency]}
              </span>
              <span className="text-xs font-semibold text-gray-700 shrink-0 min-w-[52px]">
                {a.person_name}
              </span>
              <span className="text-xs text-blue-600 group-hover:underline truncate">
                {a.title}
              </span>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
