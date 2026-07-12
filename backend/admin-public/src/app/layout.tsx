import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "字幕业务控制台",
  description: "用户、翻译任务与公共字幕的统一运营入口。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
