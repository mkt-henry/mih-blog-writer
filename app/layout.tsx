import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "메이드인헤븐 원고 관리",
  description: "원고 작성/모아보기/키워드 관리 (비공개)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
