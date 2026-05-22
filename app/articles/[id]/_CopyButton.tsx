"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function CopyButton({ title }: { title: string }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(title);
      toast.success("제목을 복사했어요");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = title;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("제목을 복사했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={busy} size="sm">
      📋 제목 복사
    </Button>
  );
}
