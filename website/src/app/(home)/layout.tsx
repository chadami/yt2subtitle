import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import "./home.css";

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hans">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&display=swap" />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
