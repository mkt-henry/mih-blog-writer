"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = { isAdmin: boolean; keywordOnly: boolean };

export default function NavBar({ isAdmin, keywordOnly }: Props) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname.startsWith("/share")) return null;

  const link = (href: string, label: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={`px-2.5 py-1 text-xs sm:text-sm rounded whitespace-nowrap transition-colors ${
          active
            ? "bg-blue-50 text-[color:var(--color-primary)] font-semibold"
            : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 bg-white border-b border-[color:var(--color-border)] px-3 py-2">
      <div className="text-sm font-bold text-[color:var(--color-primary)]">MIH</div>
      <nav className="flex gap-1 ml-1">
        {keywordOnly ? (
          link("/keywords", "키워드")
        ) : (
          <>
            {link("/", "모아보기")}
            {link("/rss", "발행 현황")}
            {link("/competitors", "경쟁 글")}
            {link("/keywords", "키워드")}
            {isAdmin && link("/admin/users", "사용자 관리")}
          </>
        )}
      </nav>
      <div className="flex-1" />
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
