import AccountFeed from "@/app/_components/AccountFeed";

export const dynamic = "force-dynamic";

// /kyh620303 와 동일한 내용(agency 슬러그 "other") — 별칭 라우트.
export default function Page() {
  return <AccountFeed account="other" />;
}
