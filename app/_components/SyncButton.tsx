"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

// 수동 "새로고침 및 알림 발송" 버튼.
//   ① POST /api/rss-sync       → 엣지 함수가 배포URL 수집 → DB articles 매칭 → 발행 상태 업데이트
//   ② POST /api/daily-notify   → 엣지 함수(daily-notify)가 발행 현황·검색 노출 쿼리를 AIStudio 알림으로 발송
//      (같은 날 다시 누르면 그날 알림이 새로 쌓이지 않고 고쳐진다)
// 09:30 cron 이후 발행분을 즉시 반영·통지하기 위한 용도.
// /rss 페이지(ActionsBar)와 메인 대시보드(FilterBar)에서 공용으로 사용.
export default function SyncButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function run() {
    setBusy(true);
    try {
      // ① RSS 동기화
      const syncRes = await fetch("/api/rss-sync", { method: "POST" });
      const sync = await syncRes.json();
      if (!syncRes.ok || sync?.ok === false) throw new Error(`동기화 실패: ${sync?.error ?? `HTTP ${syncRes.status}`}`);

      // ② AIStudio 알림 발송
      const ntRes = await fetch("/api/daily-notify", { method: "POST" });
      const nt = await ntRes.json();
      if (!ntRes.ok || nt?.ok === false) throw new Error(`알림 발송 실패: ${nt?.error ?? `HTTP ${ntRes.status}`}`);

      toast.success(`동기화 ${sync.matched ?? 0}건 · 알림 발송(오늘 ${nt.total ?? 0}건)`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={run} disabled={busy} size="sm">
      {busy ? "처리 중…" : "↻ 새로고침 및 알림 발송"}
    </Button>
  );
}
