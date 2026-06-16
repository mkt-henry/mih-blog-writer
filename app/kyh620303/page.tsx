import AccountFeed from "@/app/_components/AccountFeed";

export const dynamic = "force-dynamic";

// kyh620303 계정은 내부 agency 슬러그상 "other"에 매핑된다.
export default function Page() {
  return <AccountFeed account="other" />;
}
