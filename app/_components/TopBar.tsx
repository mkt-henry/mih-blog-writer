"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = { generatedAt: string; isAdmin: boolean };

export default function TopBar({ generatedAt, isAdmin }: Props) {
  return (
    <header className="flex items-center gap-3 bg-white border-b border-[color:var(--color-border)] px-4 py-2.5">
      <div className="text-sm font-bold text-[color:var(--color-primary)]">MIH</div>
      <nav className="flex gap-1 ml-2">
        <Link
          href="/"
          className="px-3 py-1 text-sm rounded bg-blue-50 text-[color:var(--color-primary)] font-semibold"
        >
          모아보기
        </Link>
        <Link
          href="/rss"
          className="px-3 py-1 text-sm rounded text-gray-600 hover:bg-gray-50"
        >
          발행 현황
        </Link>
        {isAdmin && (
          <Link
            href="/admin/users"
            className="px-3 py-1 text-sm rounded text-gray-600 hover:bg-gray-50"
          >
            사용자 관리
          </Link>
        )}
      </nav>
      <div className="flex-1" />
      <div className="text-xs text-[color:var(--color-text-muted)]">
        데이터 {generatedAt.slice(0, 16).replace("T", " ")}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await fetch("/api/auth/logout", { method: "POST" });
          location.href = "/login";
        }}
      >
        <Button type="submit" variant="outline" size="sm">
          로그아웃
        </Button>
      </form>
    </header>
  );
}
