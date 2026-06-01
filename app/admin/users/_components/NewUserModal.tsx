"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AGENCY_SLUGS, AGENCIES, type AgencySlug } from "@/lib/agencies";
import type { AgencyRole } from "@/lib/permissions";
import type { AdminUserRow } from "../page";

type Choice = "none" | AgencyRole;

const CHOICES: { value: Choice; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "view", label: "view" },
  { value: "editor", label: "editor" },
];

type Props = {
  onClose: () => void;
  onCreated: (u: AdminUserRow) => void;
};

export default function NewUserModal({ onClose, onCreated }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [perms, setPerms] = useState<Record<AgencySlug, Choice>>({
    mih_speaker: "none",
    mih_casting: "none",
    mih_agency: "none",
    other: "none",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("username과 password를 입력하세요");
      return;
    }
    setBusy(true);
    const permissions = Object.fromEntries(
      AGENCY_SLUGS.map((a) => [a, perms[a] === "none" ? null : perms[a]]),
    );
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, permissions }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "request failed" }));
      toast.error(`생성 실패: ${error}`);
      return;
    }
    const { user } = (await res.json()) as { user: AdminUserRow };
    toast.success("사용자 생성됨");
    onCreated(user);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-lg p-5 w-full max-w-md space-y-3">
        <h2 className="text-base font-bold">새 사용자</h2>
        <div>
          <label className="block text-xs text-gray-600 mb-1">username</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">password</label>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-gray-600 mb-1">권한</div>
          <div className="space-y-1">
            {AGENCY_SLUGS.map((a) => (
              <div key={a} className="flex items-center gap-2 text-sm">
                <div className="w-24">{AGENCIES[a].blogSlug}</div>
                <select
                  value={perms[a]}
                  onChange={(e) =>
                    setPerms((p) => ({ ...p, [a]: e.target.value as Choice }))
                  }
                  className="text-xs border rounded px-1 py-0.5"
                >
                  {CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "생성 중..." : "생성"}
          </Button>
        </div>
      </form>
    </div>
  );
}
