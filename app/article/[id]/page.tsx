import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
import { AGENCIES, type AgencySlug } from "@/lib/agencies";
import { mergeWithBusinessCard, buildBusinessCardHtml } from "@/lib/business-card";
import type { ArticleRow } from "@/lib/articles";
import CopyButton from "./_CopyButton";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ArticlePage({ params }: Props) {
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  if (perms.keywordOnly) redirect("/keywords");

  const { id } = await params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("articles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return <main className="p-6 text-red-700">DB 조회 실패: {error.message}</main>;
  if (!data) return <main className="p-6">원고를 찾을 수 없습니다. <Link href="/" className="text-blue-600 underline">← 목록으로</Link></main>;

  const article = data as ArticleRow & { html_content: string };
  const card = buildBusinessCardHtml(article.agency as AgencySlug);
  const merged = mergeWithBusinessCard(article.html_content ?? "", card);

  const srcDoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
body { margin:0; padding:24px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",Arial,sans-serif; color:#222; background:#fff; line-height:1.6; }
img { max-width:100%; height:auto; }
hr { border:none; border-top:1px solid #e0e0e0; margin:20px 0; }
</style></head><body>${merged}</body></html>`;

  return (
    <div className="min-h-screen bg-[color:var(--color-muted)]">
      <header className="bg-white border-b border-[color:var(--color-border)] px-4 py-2.5 flex items-center gap-3">
        <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">← 목록</Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold truncate">{article.title}</h1>
          <div className="text-xs text-[color:var(--color-text-muted)]">
            {AGENCIES[article.agency as AgencySlug].blogSlug} · {article.publish_date}
            {article.published_at ? ` · ${article.published_at.slice(0, 16).replace('T', ' ')} 발행` : ' · 미발행'}
          </div>
        </div>
        <CopyButton title={article.title} htmlBody={merged} />
      </header>
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        className="w-full block"
        style={{ height: "calc(100vh - 56px)", border: 0, background: "#fff" }}
      />
    </div>
  );
}
