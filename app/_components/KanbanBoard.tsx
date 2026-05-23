"use client";

import { useState } from "react";
import type { KanbanGroups } from "@/lib/articles";
import { AGENCIES, AGENCY_SLUGS } from "@/lib/agencies";
import KanbanColumn from "./KanbanColumn";

type Props = { groups: KanbanGroups; onOpen: (id: string) => void };

const TAB_LABELS: Record<string, string> = {
  mih_speaker: "스피커",
  mih_casting: "캐스팅",
  mih_agency:  "에이전시",
};

const TAB_COLORS: Record<string, string> = {
  mih_speaker: "var(--color-speaker)",
  mih_casting: "var(--color-casting)",
  mih_agency:  "var(--color-agency)",
};

export default function KanbanBoard({ groups, onOpen }: Props) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <>
      {/* ── 모바일: 탭 전환 ── */}
      <div className="md:hidden flex flex-col">
        <div className="flex border-b border-[color:var(--color-border)] bg-white sticky top-0 z-10">
          {AGENCY_SLUGS.map((slug, i) => {
            const count = groups[slug]?.pool.length ?? 0;
            const active = i === activeTab;
            return (
              <button
                key={slug}
                onClick={() => setActiveTab(i)}
                className={`flex-1 py-2.5 text-xs font-semibold transition border-b-2 ${
                  active
                    ? "border-[color:var(--color-primary)] text-[color:var(--color-primary)]"
                    : "border-transparent text-gray-500"
                }`}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                  style={{ backgroundColor: TAB_COLORS[slug] }}
                />
                {TAB_LABELS[slug]}
                <span className="ml-1 text-[10px] text-gray-400">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="p-3">
          {AGENCY_SLUGS.map((slug, i) =>
            i === activeTab ? (
              <KanbanColumn
                key={slug}
                agency={slug}
                agencyInfo={AGENCIES[slug]}
                group={groups[slug]}
                onOpen={onOpen}
              />
            ) : null
          )}
        </div>
      </div>

      {/* ── 데스크톱: 3열 그리드 ── */}
      <div className="hidden md:grid grid-cols-3 gap-3 p-4">
        {AGENCY_SLUGS.map((slug) => (
          <KanbanColumn key={slug} agency={slug} agencyInfo={AGENCIES[slug]} group={groups[slug]} onOpen={onOpen} />
        ))}
      </div>
    </>
  );
}
