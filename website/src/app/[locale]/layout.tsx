import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { JsonLd } from "@/components/json-ld";
import { htmlLanguages, isLocale } from "@/lib/i18n";
import { siteName, siteUrl } from "@/lib/site";
import "../site.css";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "zh" }, { locale: "ja" }];
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={htmlLanguages[locale]}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&display=swap" />
      </head>
      <body>
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              "@id": `${siteUrl}/#website`,
              url: siteUrl,
              name: siteName,
              inLanguage: Object.values(htmlLanguages),
              publisher: { "@id": `${siteUrl}/#organization` },
            },
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              "@id": `${siteUrl}/#organization`,
              name: siteName,
              url: siteUrl,
              logo: `${siteUrl}/vidlingo-icon.png`,
            },
          ]}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
