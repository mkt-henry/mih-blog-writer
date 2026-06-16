import { supabaseAdmin } from "@/lib/supabase";
import { AGENCIES, type AgencySlug } from "@/lib/agencies";
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";
import AccountCopyButtons from "./AccountCopyButtons";

// 계정별 공개 피드(OpenClaw 발행용). 로그인 없이 접근 가능하며
// 해당 계정의 발행 대기(pending = published_at IS NULL) 원고 중
// 가장 나중에 추가된 3개만 노출한다.
//
// 사람이 보는 관리용 페이지(/, /keywords 등)는 그대로 유지된다.
export default async function AccountFeed({ account }: { account: AgencySlug }) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("articles")
    .select("id, title, html_content, person_name, created_at")
    .eq("agency", account)
    .is("published_at", null)
    .order("created_at", { ascending: false })
    .limit(3);

  const accountName = AGENCIES[account].blogSlug;

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6 text-red-600">
        데이터를 불러올 수 없습니다.
      </main>
    );
  }

  const card = buildBusinessCardHtml(account);
  const rows = (data ?? []).map((a) => ({
    id: a.id as string,
    title: (a.title as string) ?? "",
    person_name: (a.person_name as string) ?? "",
    body: mergeWithBusinessCard((a.html_content as string) ?? "", card),
  }));

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-5">
        <h1 className="text-lg font-bold">{AGENCIES[account].name}</h1>
        <p className="text-sm text-gray-500">
          발행 대기 원고 · 최근 추가 {rows.length}개 ({accountName})
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">발행 대기 중인 원고가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((a) => (
            <li
              key={a.id}
              data-account={accountName}
              data-article-id={a.id}
              data-status="pending"
              className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{a.title}</div>
                {a.person_name ? (
                  <div className="truncate text-xs text-gray-500">{a.person_name}</div>
                ) : null}
              </div>
              <AccountCopyButtons title={a.title} body={a.body} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
