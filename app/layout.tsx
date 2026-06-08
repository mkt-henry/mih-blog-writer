import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import NavBar from "./_components/NavBar";
import { verifySession } from "@/lib/auth";
import { loadPermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "메이드인헤븐 원고 관리",
  description: "원고 작성/모아보기/키워드 관리 (비공개)",
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
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
