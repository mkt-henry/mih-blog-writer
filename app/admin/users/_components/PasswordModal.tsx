"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { AdminUserRow } from "../page";

type Props = {
  user: AdminUserRow;
  onClose: () => void;
};

export default function PasswordModal({ user, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      toast.error("password를 입력하세요");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "request failed" }));
      toast.error(`변경 실패: ${error}`);
      return;
    }
    toast.success("비밀번호 변경됨");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-lg p-5 w-full max-w-sm space-y-3">
        <h2 className="text-base font-bold">{user.username} 비밀번호 변경</h2>
        <Input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          placeholder="새 비밀번호"
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "변경 중..." : "변경"}
          </Button>
        </div>
      </form>
    </div>
  );
}
