// "MIH 시크릿" 안드로이드 앱(android/) 으로 키워드를 여는 링크 (Owner 2026-10-25).
// 네이버 검색은 X-Frame-Options: DENY 라 PWA 안에 끼울 수 없고, 휴대폰 크롬 탭은 로그인이 묻어 나온다.
// 그래서 안드로이드에서는 앱의 로그인 없는 웹뷰로 열고, 앱이 없으면 크롬이 fallback(시크릿 결과 화면 /serp)으로 연다.

export const SECRET_APP_PACKAGE = "com.bpstudio.mih.secret";

export function serpPath(keyword: string, post?: string): string {
  return `/serp?q=${encodeURIComponent(keyword)}${post ? `&post=${encodeURIComponent(post)}` : ""}`;
}

/** 크롬의 intent: 링크. 앱이 깔려 있으면 앱을, 없으면 S.browser_fallback_url 을 연다. */
export function secretAppIntent(keyword: string, post: string | undefined, origin: string): string {
  const params = `q=${encodeURIComponent(keyword)}${post ? `&post=${encodeURIComponent(post)}` : ""}`;
  const fallback = encodeURIComponent(`${origin}${serpPath(keyword, post)}`);
  return `intent://search?${params}#Intent;scheme=mihsecret;package=${SECRET_APP_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

export function isAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}
