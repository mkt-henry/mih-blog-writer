import AccountFeed, { parseFeedSearchParams } from "@/app/_components/AccountFeed";

export const dynamic = "force-dynamic";

// kyh620303 계정은 내부 agency 슬러그상 "other"에 매핑된다.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page, showHidden } = parseFeedSearchParams(await searchParams);
  return <AccountFeed account="other" page={page} showHidden={showHidden} />;
}
