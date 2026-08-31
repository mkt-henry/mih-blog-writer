"use client";

import { Button } from "@/components/ui/button";

export default function SearchForm({ term }: { term: string }) {
  return (
    <form method="get" action="/competitors" className="flex items-center gap-2">
      <input
        name="s"
        defaultValue={term}
        placeholder="인물명 또는 제목으로 검색"
        className="h-8 w-56 sm:w-72 rounded border border-[color:var(--color-border)] px-2 text-sm outline-none focus:border-[color:var(--color-primary)]"
      />
      <Button type="submit" size="sm" className="h-8 text-xs px-3">
        검색
      </Button>
      {term && (
        <a href="/competitors" className="text-xs text-gray-500 hover:underline">
          초기화
        </a>
      )}
    </form>
  );
}
