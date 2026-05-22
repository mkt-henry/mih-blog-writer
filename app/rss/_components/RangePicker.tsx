"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [7, 14, 30];

export default function RangePicker({ days }: { days: number }) {
  const router = useRouter();
  const sp = useSearchParams();

  function set(d: number) {
    const next = new URLSearchParams(sp.toString());
    next.set("days", String(d));
    router.push(`/rss?${next.toString()}`);
  }

  return (
    <div className="flex gap-0 border border-[color:var(--color-border)] rounded overflow-hidden text-xs">
      {OPTIONS.map((d) => (
        <button
          key={d}
          onClick={() => set(d)}
          className={`px-3 py-1.5 border-r last:border-r-0 border-[color:var(--color-border)] ${
            d === days ? "bg-[color:var(--color-primary)] text-white" : "bg-white text-gray-600"
          }`}
        >
          {d}일
        </button>
      ))}
    </div>
  );
}
