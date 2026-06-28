import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { AGENCIES, type AgencySlug } from "@/lib/agencies";
import { buildBusinessCardHtml, mergeWithBusinessCard } from "@/lib/business-card";
import AccountCopyButtons from "./AccountCopyButtons";
import ReserveToggle from "./ReserveToggle";

const PAGE_SIZE = 3;

type SearchParams = Record<string, string | string[] | undefined>;

// 페이지 라우트의 searchParams → AccountFeed props 파싱(공용).
export function parseFeedSearchParams(sp: SearchParams): {
  page: number;
  showHidden: boolean;
} {
  const pageRaw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const hiddenRaw = Array.isArray(sp.showHidden) ? sp.showHidden[0] : sp.showHidden;
  const showHidden = hiddenRaw === "1" || hiddenRaw === "true";
  return { page, showHidden };
}

// 계정별 공개 피드(OpenClaw 발행용). 로그인 없이 접근 가능하며
// 해당 계정의 발행 대기(pending = published_at IS NULL) 원고만 노출한다.
//
// 1인 1원고 규칙:
//   - 이미 발행된 인물(person_name)은 피드에서 제외한다.
//   - 발행 대기 원고가 한 인물에 여러 개 쌓여 있어도 인물당 1개(최신)만 노출한다.
//
// 발행 예약 숨김:
//   - 사용자가 "발행 예약 완료" 체크 → reserved_at 세팅 → 노출 목록에서 빠짐(되돌리기 가능).
//   - dedup(인물당 최신 1개) 이후 reserved_at 유무로 노출/숨김 목록을 나눈다.
//
// 페이지네이션:
//   - 노출(또는 숨김) 목록을 created_at 최신순으로 3개씩, ?page=N 으로 이동.
//   - ?showHidden=1 이면 예약 완료(숨김) 목록을 보여준다.
//
// 사람이 보는 관리용 페이지(/, /keywords 등)는 그대로 유지된다.
export default async function AccountFeed({
  account,
  page = 1,
  showHidden = false,
}: {
  account: AgencySlug;
  page?: number;
  showHidden?: boolean;
}) {
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

  // 2) 발행 대기 원고 목록(최신순) — 본문(html)은 제외해 가볍게 조회. reserved_at 포함.
  const { data: pending, error } = await sb
    .from("articles")
    .select("id, title, person_name, created_at, reserved_at")
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

  // 3) 이미 발행된 인물 제외 + 인물당 1개(최신)만 → 전체 후보 목록.
  type Row = { id: string; title: string; person_name: string; reserved: boolean };
  const seenPersons = new Set<string>();
  const all: Row[] = [];
  for (const a of pending ?? []) {
    const person = ((a.person_name as string) ?? "").trim();
    if (person && publishedPersons.has(person)) continue; // 이미 발행된 인물
    if (person && seenPersons.has(person)) continue; // 인물당 1개(최신)
    if (person) seenPersons.add(person);
    all.push({
      id: a.id as string,
      title: (a.title as string) ?? "",
      person_name: person,
      reserved: a.reserved_at != null,
    });
  }

  // 4) reserved_at 유무로 노출/숨김 분리.
  const visible = all.filter((r) => !r.reserved);
  const hidden = all.filter((r) => r.reserved);
  const list = showHidden ? hidden : visible;

  // 5) 페이지네이션 (3개씩).
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const picked = list.slice(start, start + PAGE_SIZE);

  // 6) 현재 페이지 원고의 본문(html_content)만 조회.
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
    ...p,
    body: mergeWithBusinessCard(bodyById.get(p.id) ?? "", card),
  }));

  // 링크 헬퍼 — 현재 경로(상대 URL)에 쿼리만 갱신.
  const qs = (p: number, hidden: boolean) => {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    if (hidden) params.set("showHidden", "1");
    const s = params.toString();
    return s ? `?${s}` : "?";
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold">{AGENCIES[account].name}</h1>
          <p className="text-sm text-gray-500">
            {showHidden ? "예약 완료(숨김) 원고" : "발행 대기 원고"} · 총 {list.length}개
            {totalPages > 1 ? ` · ${currentPage}/${totalPages} 페이지` : ""} ({accountName})
          </p>
        </div>
        {/* 노출 ↔ 숨김 목록 토글 */}
        {showHidden ? (
          <Link
            href={qs(1, false)}
            className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
          >
            ← 대기 원고로 돌아가기
          </Link>
        ) : hidden.length > 0 ? (
          <Link
            href={qs(1, true)}
            className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
          >
            숨긴 원고 {hidden.length}개 보기
          </Link>
        ) : null}
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          {showHidden
            ? "예약 완료(숨김) 처리된 원고가 없습니다."
            : "발행 대기 중인 원고가 없습니다."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((a) => (
            <li
              key={a.id}
              data-account={accountName}
              data-article-id={a.id}
              data-status={a.reserved ? "reserved" : "pending"}
              className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{a.title}</div>
                {a.person_name ? (
                  <div className="truncate text-xs text-gray-500">{a.person_name}</div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <ReserveToggle articleId={a.id} reserved={a.reserved} />
                <AccountCopyButtons title={a.title} body={a.body} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 이전 / 다음 */}
      {totalPages > 1 ? (
        <nav className="mt-5 flex items-center justify-between">
          {currentPage > 1 ? (
            <Link
              href={qs(currentPage - 1, showHidden)}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
            >
              ← 이전
            </Link>
          ) : (
            <span className="rounded border border-gray-100 px-3 py-1.5 text-xs font-medium text-gray-300">
              ← 이전
            </span>
          )}
          <span className="text-xs text-gray-400">
            {currentPage} / {totalPages}
          </span>
          {currentPage < totalPages ? (
            <Link
              href={qs(currentPage + 1, showHidden)}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
            >
              다음 →
            </Link>
          ) : (
            <span className="rounded border border-gray-100 px-3 py-1.5 text-xs font-medium text-gray-300">
              다음 →
            </span>
          )}
        </nav>
      ) : null}
    </main>
  );
}
