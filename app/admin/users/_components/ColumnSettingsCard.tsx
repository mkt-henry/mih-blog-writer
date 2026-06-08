"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KEYWORD_COLUMNS, type KeywordColumnKey } from "@/lib/keyword-columns";

export default function ColumnSettingsCard({ initialColumns }: { initialColumns: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialColumns));
  const [saving, setSaving] = useState(false);

  function toggle(key: KeywordColumnKey, always: boolean | undefined) {
    if (always) return; // keyword 등 고정 컬럼
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const columns = KEYWORD_COLUMNS.filter((c) => c.always || selected.has(c.key)).map((c) => c.key);
    try {
      const res = await fetch("/api/admin/settings/keyword-columns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "request failed" }));
        toast.error(`저장 실패: ${error}`);
      } else {
        toast.success("컬럼 설정 저장됨");
      }
    } catch {
      toast.error("저장 실패: 네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-lg p-3 mb-4">
      <div className="text-sm font-semibold text-gray-700 mb-2">키워드 전용 사용자 노출 컬럼 (전역)</div>
      <div className="flex flex-wrap gap-3">
        {KEYWORD_COLUMNS.map((c) => (
          <label key={c.key} className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={c.always || selected.has(c.key)}
              disabled={c.always}
              onChange={() => toggle(c.key, c.always)}
            />
            {c.label}
            {c.always && <span className="text-xs text-gray-400">(고정)</span>}
          </label>
        ))}
      </div>
      <div className="mt-3">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "저장 중…" : "컬럼 설정 저장"}</Button>
      </div>
    </div>
  );
}
