import AccountFeed, { parseFeedSearchParams } from "@/app/_components/AccountFeed";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page, showHidden } = parseFeedSearchParams(await searchParams);
  return <AccountFeed account="mih_speaker" page={page} showHidden={showHidden} />;
}
