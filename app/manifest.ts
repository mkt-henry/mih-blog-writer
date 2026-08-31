import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "메이드인헤븐 원고 관리",
    short_name: "MIH",
    description: "원고 모아보기·발행 현황·경쟁 글·키워드 관리 (비공개)",
    // 로그인 화면이 아니라 대시보드로 연다 — 세션이 없으면 알아서 로그인으로 넘어간다.
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#F5F6F8",
    theme_color: "#1565C0",
    lang: "ko",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "발행 현황", url: "/rss" },
      { name: "경쟁 글", url: "/competitors" },
      { name: "키워드", url: "/keywords" },
    ],
  };
}
