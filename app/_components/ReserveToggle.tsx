"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  articleId: string;
  reserved: boolean;
};

// 계정별 공개 피드용 "발행 예약 완료(숨김)" 체크박스.
// 체크하면 reserved_at을 세팅해 피드에서 숨기고, 해제하면 다시 노출한다.
// 토글 후 router.refresh()로 서버 컴포넌트를 재조회해 목록을 갱신한다.
export default function ReserveToggle({ articleId, reserved }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !reserved;
    setBusy(true);
    try {
      const res = await fetch("/api/feed/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: articleId, reserved: next }),
      });
      if (!res.ok) return; // 실패 시 조용히 무시(상태 유지)
      startTransition(() => router.refresh());
    } catch {
      // 네트워크 오류는 조용히 무시
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || isPending;

  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-gray-500 select-none">
      <input
        type="checkbox"
        checked={reserved}
        disabled={disabled}
        onChange={toggle}
        className="h-4 w-4 cursor-pointer accent-gray-900"
      />
      <span>{reserved ? "예약 완료(숨김)" : "발행 예약 완료"}</span>
    </label>
  );
}
