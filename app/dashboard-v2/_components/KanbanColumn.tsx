"use client";

import { useEffect, useState } from "react";
import type { AgencyGroup } from "@/lib/articles";
import type { AgencyInfo, AgencySlug } from "@/lib/agencies";
import ArticleCard from "./ArticleCard";

type Sort = "oldest" | "newest" | "name";

const AGENCY_COLOR: Record<AgencySlug, string> = {
  mih_speaker: "bg-[color:var(--color-speaker)]",
  mih_casting: "bg-[color:var(--color-casting)]",
  mih_agency: "bg-[color:var(--color-agency)]",
};

const LS_KEY = (a: string) => `dashboard-v2.sort.${a}`;

type Props = {
  agency: AgencySlug;
  agencyInfo: AgencyInfo;
  group: AgencyGroup;
  onOpen: (id: string) => void;
};

export default function KanbanColumn({ agency, agencyInfo, group, onOpen }: Props) {
  const [sort, setSort] = useState<Sort>("oldest");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY(agency)) : null;
    if (saved === "oldest" || saved === "newest" || saved === "name") setSort(saved);
  }, [agency]);

  const sortedPool = [...group.pool].sort((a, b) => {
    if (sort === "name") return a.person_name.localeCompare(b.person_name);
    if (sort === "newest") return b.created_at.localeCompare(a.created_at);
    return a.created_at.localeCompare(b.created_at);
  });

  function changeSort(next: Sort) {
    setSort(next);
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY(agency), next);
  }

  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-lg p-2.5 flex flex-col min-h-[360px]">
      <div className="flex items-start justify-between border-b border-gray-100 pb-2 mb-1.5">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-bold">
            <span className={`w-2 h-2 rounded-full ${AGENCY_COLOR[agency]}`} />
            {agencyInfo.blogSlug}
          </div>
          <div className="flex gap-0.5 mt-1">
            {(["oldest", "newest", "name"] as Sort[]).map((s) => (
              <button
                key={s}
                onClick={() => changeSort(s)}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  sort === s
                    ? "bg-[color:var(--color-primary)] text-white border-[color:var(--color-primary)]"
                    : "bg-white text-gray-600 border-[color:var(--color-border)]"
                }`}
              >
                {s === "oldest" ? "오래된순" : s === "newest" ? "최신" : "이름"}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[10px] text-[color:var(--color-text-muted)]">
          풀 <b className="text-gray-800">{group.pool.length}</b> · 오늘 <b className="text-gray-800">{group.today.length}</b>
        </div>
      </div>

      <Section label="📥 발행 대기" count={sortedPool.length} color="text-[color:var(--color-primary)]">
        {sortedPool.map((a) => <ArticleCard key={a.id} article={a} variant="pool" onOpen={onOpen} />)}
      </Section>

      <Section label="✓ 오늘 발행" count={group.today.length} color="text-[color:var(--color-agency)]">
        {group.today.map((a) => <ArticleCard key={a.id} article={a} variant="published" onOpen={onOpen} />)}
      </Section>

      <RecentSection articles={group.recent} onOpen={onOpen} />
    </div>
  );
}

function Section({ label, count, color, children }: { label: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5 first:mt-0">
      <div className={`text-[9px] font-bold uppercase tracking-wide flex justify-between items-center px-0.5 pt-1 pb-0.5 ${color}`}>
        <span>{label}</span>
        <span className="text-gray-500 font-medium">{count}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function RecentSection({ articles, onOpen }: { articles: AgencyGroup["recent"]; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (articles.length === 0) return null;
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-[9px] font-bold uppercase tracking-wide flex justify-between items-center px-0.5 pt-1 pb-0.5 text-gray-500 hover:text-gray-700"
      >
        <span>최근 발행</span>
        <span>{open ? "▾" : "▸"} {articles.length}</span>
      </button>
      {open && articles.map((a) => <ArticleCard key={a.id} article={a} variant="recent" onOpen={onOpen} />)}
    </div>
  );
}
