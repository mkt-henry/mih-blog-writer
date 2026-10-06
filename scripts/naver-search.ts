#!/usr/bin/env node
//
// 네이버 검색 노출 확인 + 스크린샷 AIStudio·Discord 알림 실행기(수동 예비 경로).
//
// 예전에는 Supabase pg_cron(mih-serp-check)이 Vercel 의
// /api/cron/naver-search-screenshots 를 때렸다. 그 라우트는 검색 페이지 수십 개를
// 받아오고 스크린샷을 기다리느라 최대 300초를 쓰는데, 그 시간이 전부 Vercel Fluid
// 사용량으로 잡힌다. 요청에 응답하는 일이 아니므로 여기서 돌린다.
// (2026-09-10: Hobby 한도 초과로 계정 전체 배포가 중단된 뒤 옮겼다.)
// 2026-10-05: 정규 스케줄은 pg_cron(mih-serp-check) → Vercel 라우트가 계속 맡고 있었다(매일 00:30 UTC 기록됨).
// 둘 다 돌면 기록·알림이 두 번 나가므로 이 실행기는 GitHub Actions 수동 실행 전용 예비 경로로 둔다.
//
// 로직은 runDailyNaverScreenshotJob 그대로다 — 복제하지 않는다. 실행 위치만 바뀐다.

import path from "node:path";
import { runDailyNaverScreenshotJob, type NotifyOnly } from "@/lib/naver-search";
import { postSerpTestNotice } from "@/lib/naver-search/notify";

async function main() {
  // 로컬 실행 편의용. CI 에서는 시크릿이 이미 env 에 있어 없어도 된다.
  try {
    const { config } = await import("dotenv");
    config({ path: path.resolve(process.cwd(), ".env.local") });
  } catch {
    /* dotenv 없거나 .env.local 없으면 process.env 그대로 쓴다 */
  }

  // SERP_ONLY=discord|aistudio 면 그 채널로만 보낸다. Discord 는 NAVER_SEARCH_DISCORD_WEBHOOK_URL 이 있을 때만 간다.
  const rawOnly = process.env.SERP_ONLY?.trim();
  const only: NotifyOnly | undefined = rawOnly === "discord" || rawOnly === "aistudio" ? rawOnly : undefined;

  if (only !== "discord" && !process.env.AISTUDIO_NOTIFY_TOKEN) {
    throw new Error("AISTUDIO_NOTIFY_TOKEN 환경변수가 필요하다.");
  }

  // 연결 확인: 검색·기록 없이 푸시 없는 [테스트] 알림 하나만 보낸다.
  if (process.env.SERP_TEST === "1" || process.env.SERP_TEST === "true") {
    await postSerpTestNotice("github-actions");
    console.log("test notice sent");
    return;
  }

  // 특정 날짜를 다시 돌리고 싶을 때만 넘긴다. 비우면 기본 대상일(D-1, D-3 …).
  const raw = process.env.SERP_DATE?.trim();
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;

  const summary = await runDailyNaverScreenshotJob({ date, only });
  console.log(JSON.stringify(summary, null, 2));
  // 항목별 오류는 요약(errors)에 담겨 나온다. 소스 한 곳이 죽었다고 매일 빨간
  // 배지가 뜨면 아무도 안 보므로 실행 자체는 성공으로 둔다.
}

main().catch((e: unknown) => {
  console.error("[naver-search] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
