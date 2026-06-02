"use client";

import { useState } from "react";
import type { KanbanGroups } from "@/lib/articles";
import { AGENCIES, type AgencySlug } from "@/lib/agencies";
import { visibleAgencies, type UserPermissions } from "@/lib/permissions";
import KanbanColumn from "./KanbanColumn";

type Props = { groups: KanbanGroups; onOpen: (id: string) => void; perms: UserPermissions };

const TAB_LABELS: Record<AgencySlug, string> = {
  mih_speaker: "speaker",
  mih_casting: "casting",
  mih_agency: "agency",
  other: "kyh620303",
};

const TAB_COLORS: Record<AgencySlug, string> = {
  mih_speaker: "var(--color-speaker)",
  mih_casting: "var(--color-casting)",
  mih_agency: "var(--color-agency)",
  other: "var(--color-other)",
};

export default function KanbanBoard({ groups, onOpen, perms }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const slugs = visibleAgencies(perms);

  return (
    <>
      <div className="md:hidden flex flex-col">
        <div className="flex border-b border-[color:var(--color-border)] bg-white sticky top-0 z-10">
          {slugs.map((slug, i) => {
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
                {TAB_LABELS[slug] ?? AGENCIES[slug].blogSlug}
                <span className="ml-1 text-[10px] text-gray-400">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="p-3">
          {slugs.map((slug, i) =>
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

      <div
        className="hidden md:grid gap-3 p-4"
        style={{ gridTemplateColumns: `repeat(${slugs.length}, minmax(0, 1fr))` }}
      >
        {slugs.map((slug) => (
          <KanbanColumn key={slug} agency={slug} agencyInfo={AGENCIES[slug]} group={groups[slug]} onOpen={onOpen} />
        ))}
      </div>
    </>
  );
}
