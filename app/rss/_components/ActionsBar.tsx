"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function ActionsBar() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function sync() {
    setBusy(true);
    try {
      const res = await fetch("/api/rss-sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok || body?.ok === false) throw new Error(body?.error ?? `HTTP ${res.status}`);
      toast.success(`동기화 완료: ${body.matched ?? 0}건 매칭`);
      router.refresh();
    } catch (e) {
      toast.error("동기화 실패: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button onClick={sync} disabled={busy} size="sm">{busy ? "동기화 중…" : "↻ 지금 동기화"}</Button>
    </div>
  );
}
