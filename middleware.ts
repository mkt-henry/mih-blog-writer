import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./lib/auth-constants";

// 미인증 시 /login으로 리다이렉트.
// 실제 세션 유효성(만료 등)은 페이지/route handler에서 verifySession()으로 다시 확인.
// 미들웨어에서는 쿠키 존재 여부로만 빠르게 게이트키핑.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasCookie = !!req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // /login, /api/auth/*, /api/feed/*(공개 피드 토글), 정적 자산, 계정별 공개 피드(OpenClaw 발행용) 제외 전부 보호
  //
  // 설치형 앱(PWA) 파일도 열어 둬야 한다 — 매니페스트·아이콘·서비스워커가 /login 으로 리다이렉트되면
  // 브라우저가 "앱 설치"를 띄우지 않고 서비스워커 등록도 실패한다(스크립트 대신 HTML 이 온다).
  // 이 파일들에는 로그인해야 볼 데이터가 없다(앱 이름·색·아이콘 경로뿐).
  matcher: [
    "/((?!login|share|mih_speaker|mih_casting|mih_agency|mih_other|kyh620303|api/auth|api/cron|api/feed|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
