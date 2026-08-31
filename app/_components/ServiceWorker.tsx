"use client";

import { useEffect } from "react";

// 앱 설치가 뜨려면 서비스 워커가 등록돼 있어야 한다. 등록만 하고 아무것도 하지 않는다.
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // 로그인·데이터 요청과 경쟁하지 않도록 첫 화면이 그려진 뒤에 등록한다.
    const id = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
