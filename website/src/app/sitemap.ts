import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { languageAlternates, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const legalRoutes = [
    { path: "/privacy", lastModified: "2026-07-14" },
    { path: "/terms", lastModified: "2026-07-14" },
  ];

  return [
    { url: siteUrl, lastModified: new Date("2026-11-06"), changeFrequency: "monthly", priority: 1 },
    ...legalRoutes.flatMap(({ path, lastModified }) => locales.map((locale) => ({
      url: `${siteUrl}/${locale}${path}`,
      lastModified: new Date(lastModified),
      changeFrequency: "yearly" as const,
      priority: 0.3,
      alternates: { languages: languageAlternates(path) },
    }))),
  ];
}
