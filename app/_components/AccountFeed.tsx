import { supabaseAdmin } from "@/lib/supabase";
import { AGENCIES, type AgencySlug } from "@/lib/agencies";
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";
import AccountCopyButtons from "./AccountCopyButtons";

// 계정별 공개 피드(OpenClaw 발행용). 로그인 없이 접근 가능하며
// 해당 계정의 발행 대기(pending = published_at IS NULL) 원고만 노출한다.
//
// 1인 1원고 규칙:
//   - 이미 발행된 인물(person_name)은 피드에서 제외한다.
//     (같은 인물의 새 초안이 남아 있어도 "이미 발행된 원고"가 다시 뜨면 안 됨)
//   - 발행 대기 원고가 한 인물에 여러 개 쌓여 있어도 인물당 1개(최신)만 노출한다.
//   → 위 기준으로 가장 나중에 추가된 3개만 노출.
//
// 사람이 보는 관리용 페이지(/, /keywords 등)는 그대로 유지된다.
export default async function AccountFeed({ account }: { account: AgencySlug }) {
  const sb = supabaseAdmin();

  // 1) 이미 발행된 인물 집합 — 한 번 발행된 인물은 피드에서 영구 제외(1인 1원고).
  const { data: publishedRows } = await sb
    .from("articles")
    .select("person_name")
    .eq("agency", account)
    .not("published_at", "is", null);
  const publishedPersons = new Set(
    (publishedRows ?? [])
      .map((r) => ((r.person_name as string) ?? "").trim())
      .filter(Boolean)
  );

  // 2) 발행 대기 원고 목록(최신순) — 본문(html)은 제외해 가볍게 조회.
  const { data: pending, error } = await sb
    .from("articles")
    .select("id, title, person_name, created_at")
    .eq("agency", account)
    .is("published_at", null)
    .order("created_at", { ascending: false });

  const accountName = AGENCIES[account].blogSlug;

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6 text-red-600">
        데이터를 불러올 수 없습니다.
      </main>
    );
  }

  // 3) 이미 발행된 인물 제외 + 인물당 1개(최신)만 → 상위 3개 선택.
  const seenPersons = new Set<string>();
  const picked: { id: string; title: string; person_name: string }[] = [];
  for (const a of pending ?? []) {
    const person = ((a.person_name as string) ?? "").trim();
    if (person && publishedPersons.has(person)) continue; // 이미 발행된 인물
    if (person && seenPersons.has(person)) continue; // 인물당 1개
    if (person) seenPersons.add(person);
    picked.push({
      id: a.id as string,
      title: (a.title as string) ?? "",
      person_name: person,
    });
    if (picked.length >= 3) break;
  }

  // 4) 선택된 원고의 본문(html_content)만 조회.
  const ids = picked.map((p) => p.id);
  const bodyById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: full } = await sb
      .from("articles")
      .select("id, html_content")
      .in("id", ids);
    for (const f of full ?? []) {
      bodyById.set(f.id as string, (f.html_content as string) ?? "");
    }
  }

  const card = buildBusinessCardHtml(account);
  const rows = picked.map((p) => ({
    id: p.id,
    title: p.title,
    person_name: p.person_name,
    body: mergeWithBusinessCard(bodyById.get(p.id) ?? "", card),
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
