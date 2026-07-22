import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { seoPages, seoPageSlugs } from "@/lib/seo-pages";
import { languageAlternates, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: "", lastModified: "2026-07-22", changeFrequency: "monthly" as const, priority: 1 },
    ...seoPageSlugs.map((slug) => ({
      path: `/${slug}`,
      lastModified: seoPages[slug].updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { path: "/privacy", lastModified: "2026-07-14", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/terms", lastModified: "2026-07-14", changeFrequency: "yearly" as const, priority: 0.3 },
  ];

  return routes.flatMap(({ path, lastModified, changeFrequency, priority }) => locales.map((locale) => ({
    url: `${siteUrl}/${locale}${path}`,
    lastModified: new Date(lastModified),
    changeFrequency,
    priority,
    alternates: { languages: languageAlternates(path) },
  })));
}
