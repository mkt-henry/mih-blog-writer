"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = { generatedAt: string };

export default function TopBar({ generatedAt }: Props) {
  return (
    <header className="flex items-center gap-2 bg-white border-b border-[color:var(--color-border)] px-3 py-2">
      <div className="text-sm font-bold text-[color:var(--color-primary)]">MIH</div>
      <nav className="flex gap-1 ml-1">
        <Link href="/" className="px-2.5 py-1 text-xs sm:text-sm rounded bg-blue-50 text-[color:var(--color-primary)] font-semibold whitespace-nowrap">모아보기</Link>
        <Link href="/rss" className="px-2.5 py-1 text-xs sm:text-sm rounded text-gray-600 hover:bg-gray-50 whitespace-nowrap">발행 현황</Link>
      </nav>
      <div className="flex-1" />
      <div className="hidden sm:block text-xs text-[color:var(--color-text-muted)] whitespace-nowrap">
        데이터 {generatedAt.slice(0, 16).replace('T', ' ')}
      </div>
      <form onSubmit={async (e) => {
        e.preventDefault();
        await fetch("/api/auth/logout", { method: "POST" });
        location.href = "/login";
      }}>
        <Button type="submit" variant="outline" size="sm" className="text-xs px-2 py-1 h-7">로그아웃</Button>
      </form>
    </header>
  );
}
