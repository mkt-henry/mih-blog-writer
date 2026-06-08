"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { AgencyRole } from "@/lib/permissions";
import { AGENCY_SLUGS, AGENCIES, type AgencySlug } from "@/lib/agencies";
import type { AdminUserRow } from "../page";
import NewUserModal from "./NewUserModal";
import PasswordModal from "./PasswordModal";

type Props = {
  initialUsers: AdminUserRow[];
  currentUserId: string;
};

type Choice = "none" | AgencyRole;

const CHOICES: { value: Choice; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "view", label: "view" },
  { value: "editor", label: "editor" },
];

function choiceFromRole(role: AgencyRole | null): Choice {
  return role ?? "none";
}

export default function UsersTable({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers);
  const [showNew, setShowNew] = useState(false);
  const [pwTarget, setPwTarget] = useState<AdminUserRow | null>(null);

  async function setRole(user: AdminUserRow, agency: AgencySlug, next: Choice) {
    const prev = user.permissions[agency];
    const optimistic: AdminUserRow = {
      ...user,
      permissions: { ...user.permissions, [agency]: next === "none" ? null : next },
    };
    setUsers((cur) => cur.map((u) => (u.id === user.id ? optimistic : u)));

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { [agency]: next === "none" ? null : next } }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "request failed" }));
      toast.error(`권한 저장 실패: ${error}`);
      setUsers((cur) =>
        cur.map((u) =>
          u.id === user.id
            ? { ...u, permissions: { ...u.permissions, [agency]: prev } }
            : u,
        ),
      );
    } else {
      toast.success("권한 저장됨");
    }
  }

  async function setKeywordOnly(user: AdminUserRow, next: boolean) {
    const prev = user.keywordOnly;
    setUsers((cur) => cur.map((u) => (u.id === user.id ? { ...u, keywordOnly: next } : u)));
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword_only: next }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "request failed" }));
        toast.error(`저장 실패: ${error}`);
        setUsers((cur) => cur.map((u) => (u.id === user.id ? { ...u, keywordOnly: prev } : u)));
      } else {
        toast.success("저장됨");
      }
    } catch {
      toast.error("저장 실패: 네트워크 오류");
      setUsers((cur) => cur.map((u) => (u.id === user.id ? { ...u, keywordOnly: prev } : u)));
    }
  }

  async function removeUser(user: AdminUserRow) {
    if (!confirm(`사용자 ${user.username}을(를) 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "request failed" }));
      toast.error(`삭제 실패: ${error}`);
      return;
    }
    setUsers((cur) => cur.filter((u) => u.id !== user.id));
    toast.success("삭제됨");
  }

  return (
    <div className="bg-white border border-[color:var(--color-border)] rounded-lg">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="text-sm text-gray-600">총 {users.length}명</div>
        <Button size="sm" onClick={() => setShowNew(true)}>＋ 새 사용자</Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2">username</th>
            {AGENCY_SLUGS.map((a) => (
              <th key={a} className="text-left px-3 py-2">{AGENCIES[a].blogSlug}</th>
            ))}
            <th className="text-left px-3 py-2 w-24">키워드 전용</th>
            <th className="text-left px-3 py-2 w-24">작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="px-3 py-2">
                {u.username}
                {u.id === currentUserId && <span className="ml-1 text-xs text-gray-500">(나)</span>}
              </td>
              {AGENCY_SLUGS.map((a) => (
                <td key={a} className="px-3 py-2">
                  {u.isAdmin ? (
                    <span
                      className="text-xs text-amber-700"
                      title="ADMIN_USERNAMES env에서 관리"
                    >
                      admin ★
                    </span>
                  ) : (
                    <select
                      value={choiceFromRole(u.permissions[a])}
                      onChange={(e) => setRole(u, a, e.target.value as Choice)}
                      className="text-xs border rounded px-1 py-0.5"
                    >
                      {CHOICES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  )}
                </td>
              ))}
              <td className="px-3 py-2">
                {u.isAdmin ? (
                  <span className="text-xs text-gray-400">—</span>
                ) : (
                  <input
                    type="checkbox"
                    checked={u.keywordOnly}
                    onChange={(e) => setKeywordOnly(u, e.target.checked)}
                  />
                )}
              </td>
              <td className="px-3 py-2">
                {u.isAdmin ? (
                  <span className="text-xs text-gray-400">—</span>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPwTarget(u)}
                      className="text-xs px-1.5 py-0.5 border rounded hover:bg-gray-50"
                      title="비밀번호 변경"
                    >
                      🔑
                    </button>
                    <button
                      onClick={() => removeUser(u)}
                      className="text-xs px-1.5 py-0.5 border rounded hover:bg-red-50 text-red-600"
                      title="삭제"
                    >
                      🗑
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showNew && (
        <NewUserModal
          onClose={() => setShowNew(false)}
          onCreated={(u) => {
            setUsers((cur) => [...cur, u]);
            setShowNew(false);
          }}
        />
      )}
      {pwTarget && (
        <PasswordModal
          user={pwTarget}
          onClose={() => setPwTarget(null)}
        />
      )}
    </div>
  );
}
