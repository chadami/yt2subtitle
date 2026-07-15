import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { htmlLanguages, isLocale } from "@/lib/i18n";
import "../globals.css";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "zh" }, { locale: "ja" }];
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={htmlLanguages[locale]}>
      <body>{children}</body>
    </html>
  );
}
