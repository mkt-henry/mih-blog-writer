"use client";

import { useEffect } from "react";
import { resyncPushSubscription } from "@/lib/push-client";

// 앱 설치가 뜨려면 서비스 워커가 등록돼 있어야 한다.
// 알림을 허용한 기기면 등록 뒤 푸시 구독도 서버에 다시 맞춰 둔다(lib/push-client.ts 설명 참고).
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // 로그인·데이터 요청과 경쟁하지 않도록 첫 화면이 그려진 뒤에 등록한다.
    const id = window.setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(async (reg) => {
          await navigator.serviceWorker.ready;
          await resyncPushSubscription(reg);
        })
        .catch(() => {});
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
