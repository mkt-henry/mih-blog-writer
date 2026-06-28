import AccountFeed, { parseFeedSearchParams } from "@/app/_components/AccountFeed";

export const dynamic = "force-dynamic";

// /kyh620303 와 동일한 내용(agency 슬러그 "other") — 별칭 라우트.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page, showHidden } = parseFeedSearchParams(await searchParams);
  return <AccountFeed account="other" page={page} showHidden={showHidden} />;
}
