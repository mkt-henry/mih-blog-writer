"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { KanbanGroups, KanbanKpis, ArticleRow } from "@/lib/articles";
import { findNeighbor } from "@/lib/articles";
import type { UserPermissions } from "@/lib/permissions";
import KpiStrip from "./KpiStrip";
import FilterBar, { type FilterChip } from "./FilterBar";
import KanbanBoard from "./KanbanBoard";
import ArticleModal from "./ArticleModal";

type Props = {
  groups: KanbanGroups;
  kpis: KanbanKpis;
  generatedAt: string;
  perms: UserPermissions;
};

const KST_OFFSET_MS = 9 * 3600_000;
function isToday(iso: string): boolean {
  const t = Date.parse(iso);
  const midnight = Math.floor((Date.now() + KST_OFFSET_MS) / 86400_000) * 86400_000 - KST_OFFSET_MS;
  return t >= midnight;
}

export default function DashboardClient({ groups, kpis, generatedAt, perms }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("article");

  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<FilterChip>("all");

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (a: ArticleRow) => {
      if (chip === "unpublished" && a.published_at !== null) return false;
      if (chip === "today" && (a.published_at === null || !isToday(a.published_at))) return false;
      if (chip === "missing_instagram" && a.instagram_url) return false;
      if (!q) return true;
      return (
        a.person_name.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        (a.notes ?? "").toLowerCase().includes(q)
      );
    };
    const filter = (g: typeof groups.mih_speaker) => ({
      pool: g.pool.filter(match),
      today: g.today.filter(match),
      recent: g.recent.filter(match),
    });
    return {
      mih_speaker: filter(groups.mih_speaker),
      mih_casting: filter(groups.mih_casting),
      mih_agency: filter(groups.mih_agency),
      other: filter(groups.other),
    };
  }, [groups, search, chip]);

  const openModal = useCallback((id: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("article", id);
    router.push(`?${sp.toString()}`, { scroll: false });
  }, [params, router]);

  const closeModal = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("article");
    router.push(sp.size > 0 ? `?${sp.toString()}` : "/", { scroll: false });
  }, [params, router]);

  const navigate = useCallback((direction: "prev" | "next") => {
    if (!openId) return;
    const next = findNeighbor(filteredGroups, openId, direction);
    if (next) openModal(next);
  }, [openId, filteredGroups, openModal]);

  return (
    <div className="min-h-screen bg-[color:var(--color-muted)] text-[color:var(--color-text)]">
      <KpiStrip kpis={kpis} />
      <FilterBar search={search} onSearch={setSearch} chip={chip} onChip={setChip} />
      <KanbanBoard groups={filteredGroups} onOpen={openModal} perms={perms} />
      <ArticleModal articleId={openId} onClose={closeModal} onNeighbor={navigate} perms={perms} />
    </div>
  );
}
