"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = { generatedAt: string };

export default function TopBar({ generatedAt }: Props) {
  return (
    <header className="flex items-center gap-3 bg-white border-b border-[color:var(--color-border)] px-4 py-2.5">
      <div className="text-sm font-bold text-[color:var(--color-primary)]">MIH</div>
      <nav className="flex gap-1 ml-2">
        <Link href="/dashboard-v2" className="px-3 py-1 text-sm rounded bg-blue-50 text-[color:var(--color-primary)] font-semibold">모아보기</Link>
        <Link href="/keywords" className="px-3 py-1 text-sm rounded text-gray-600 hover:bg-gray-50">키워드</Link>
        <Link href="/rss" className="px-3 py-1 text-sm rounded text-gray-600 hover:bg-gray-50">발행 현황</Link>
        <Link href="/rss-v2" className="px-2 py-1 text-[10px] rounded text-blue-600 hover:bg-blue-50 self-center">v2(베타)</Link>
      </nav>
      <div className="flex-1" />
      <div className="text-xs text-[color:var(--color-text-muted)]">
        데이터 {generatedAt.slice(0, 16).replace('T', ' ')}
      </div>
      <form onSubmit={async (e) => {
        e.preventDefault();
        await fetch("/api/auth/logout", { method: "POST" });
        location.href = "/login";
      }}>
        <Button type="submit" variant="outline" size="sm">로그아웃</Button>
      </form>
    </header>
  );
}
