import type { MetadataRoute } from "next";
import { htmlLanguages, locales } from "@/lib/i18n";
import { languageAlternates, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/privacy", "/terms"];
  return paths.flatMap((path) => locales.map((locale) => ({
    url: `${siteUrl}/${locale}${path}`,
    lastModified: new Date("2026-07-14"),
    changeFrequency: path ? "yearly" as const : "monthly" as const,
    priority: path ? 0.3 : 1,
    alternates: { languages: { ...languageAlternates(path), "x-default": `${siteUrl}/en${path}`, [htmlLanguages[locale]]: `${siteUrl}/${locale}${path}` } },
  })));
}
