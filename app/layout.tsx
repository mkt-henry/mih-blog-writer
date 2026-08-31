import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import NavBar from "./_components/NavBar";
import ServiceWorker from "./_components/ServiceWorker";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "메이드인헤븐 원고 관리",
  description: "원고 작성/모아보기/키워드 관리 (비공개)",
  applicationName: "MIH",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  // 홈 화면에서 열었을 때 주소창 없이 앱처럼 뜨게 한다(iOS).
  appleWebApp: { capable: true, title: "MIH", statusBarStyle: "default" },
  // Next 는 표준 태그(mobile-web-app-capable)만 넣는다. 예전 iOS 는 아직 이 이름만 본다.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#1565C0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await verifySession();
  let isAdmin = false;
  let keywordOnly = false;
  if (user) {
    const perms = await loadPermissions(user.id, user.username);
    isAdmin = perms.isAdmin;
    keywordOnly = perms.keywordOnly;
  }

  return (
    <html lang="ko" className={cn("font-sans", geist.variable)}>
      <body>
        {user && <NavBar isAdmin={isAdmin} keywordOnly={keywordOnly} />}
        {children}
        <ServiceWorker />
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
