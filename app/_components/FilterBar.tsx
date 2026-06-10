"use client";

import { Input } from "@/components/ui/input";
import SyncButton from "./SyncButton";

export type FilterChip = "all" | "unpublished" | "today" | "missing_instagram";

type Props = {
  search: string;
  onSearch: (s: string) => void;
  chip: FilterChip;
  onChip: (c: FilterChip) => void;
};

const CHIPS: { key: FilterChip; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "unpublished", label: "미발행" },
  { key: "today", label: "오늘" },
  { key: "missing_instagram", label: "인스타URL 미등록" },
];

export default function FilterBar({ search, onSearch, chip, onChip }: Props) {
  return (
    <div className="bg-white border-b border-[color:var(--color-border)]">
      <div className="flex items-center gap-2 px-3 sm:px-4 pt-2">
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="🔍 인물명·제목 검색..."
          className="flex-1 sm:max-w-xs"
        />
        <div className="flex-1" />
        <SyncButton />
      </div>
      <div className="flex gap-1.5 px-3 sm:px-4 py-2 overflow-x-auto scrollbar-none">
        {CHIPS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChip(key)}
            className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap flex-shrink-0 ${
              chip === key
                ? "bg-[color:var(--color-primary)] text-white border-[color:var(--color-primary)]"
                : "bg-white text-gray-600 border-[color:var(--color-border)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
