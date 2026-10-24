import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";
import { buildSearchReport, buildStatusReport, kstDateStr } from "@/lib/daily-report";
import { fetchAllRss } from "@/lib/daily-report.server";
import TodayClient from "./_components/TodayClient";

export const dynamic = "force-dynamic";

// 첫 화면 "오늘" (Owner 2026-10-22): 오늘자 발행 현황(Discord 발송 양식 그대로)과
// 노출을 확인할 키워드 검색 링크를 탭으로 나눠 바로 보고 복사한다. 칸반 모아보기는 /board 로 옮겼다.
// 매일 알림(마지막 발행 10분 뒤)을 기다리지 않게 열 때마다 네이버 RSS 로 지금 시각 기준을 만든다.
export default async function TodayPage() {
  const user = await verifySession();
  if (!user) redirect("/login");
  const perms = await loadPermissions(user.id, user.username);
  if (perms.keywordOnly) redirect("/keywords");

  const now = Date.now();
  const today = kstDateStr(now, 0);
  const yesterday = kstDateStr(now, -1);
  const { rss, errors } = await fetchAllRss();

  return (
    <TodayClient
      status={buildStatusReport(rss, errors, today, new Date(now).toISOString())}
      searchYesterday={buildSearchReport(rss, yesterday)}
      searchToday={buildSearchReport(rss, today)}
      rssErrors={errors}
      generatedAt={new Date(now).toISOString()}
    />
  );
}
