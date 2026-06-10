"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

// 수동 "새로고침 및 디스코드 발송" 버튼.
//   ① POST /api/rss-sync       → 엣지 함수가 배포URL 수집 → DB articles 매칭 → 발행 상태 업데이트
//   ② POST /api/discord-notify → 엣지 함수가 발행현황/검색노출 채널로 디스코드 메시지 발송
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

      // ② 디스코드 발송
      const dcRes = await fetch("/api/discord-notify", { method: "POST" });
      const dc = await dcRes.json();
      if (!dcRes.ok || dc?.ok === false) throw new Error(`디스코드 발송 실패: ${dc?.error ?? `HTTP ${dcRes.status}`}`);

      toast.success(`동기화 ${sync.matched ?? 0}건 · 디스코드 발송(오늘 ${dc.total ?? 0}건)`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={run} disabled={busy} size="sm">
      {busy ? "처리 중…" : "↻ 새로고침 및 디스코드 발송"}
    </Button>
  );
}
