import type { Metadata } from "next";
import { htmlLanguages, locales, type Locale } from "./i18n";

export const siteUrl = "https://vidlingo.online";

export function getChromeWebStoreUrl() {
  const value = process.env.NEXT_PUBLIC_CHROME_WEB_STORE_URL;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_CHROME_WEB_STORE_URL is required for production builds.");
    }
    return "https://chromewebstore.google.com/";
  }

  const url = new URL(value);
  const allowedHosts = new Set(["chromewebstore.google.com", "chrome.google.com"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
    throw new Error("NEXT_PUBLIC_CHROME_WEB_STORE_URL must be an HTTPS Chrome Web Store URL.");
  }
  return url.toString();
}

export function languageAlternates(path = "") {
  return Object.fromEntries(
    locales.map((locale) => [htmlLanguages[locale], `${siteUrl}/${locale}${path}`]),
  );
}

export function pageMetadata(
  locale: Locale,
  title: string,
  description: string,
  path = "",
): Metadata {
  const canonical = `${siteUrl}/${locale}${path}`;
  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    alternates: { canonical, languages: languageAlternates(path) },
    openGraph: {
      type: "website",
      siteName: "VidLingo",
      locale: htmlLanguages[locale].replace("-", "_"),
      url: canonical,
      title,
      description,
      images: [{ url: "/og-card.png", width: 1200, height: 630, alt: "VidLingo subtitle workspace" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og-card.png"] },
  };
}
