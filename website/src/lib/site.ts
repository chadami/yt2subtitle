import type { Metadata } from "next";
import { htmlLanguages, locales, type Locale } from "./i18n";

export const siteUrl = "https://www.vidlingo.online";
export const siteName = "VidLingo";
export const chromeWebStoreUrl = "https://chromewebstore.google.com/detail/vidlingo/aknhnkdkeiojehikedcpkpingbfkfldk";
// Mac 版安装包地址。未配置时下载按钮跳到首页底部的试用段落，避免出现失效链接。
export function getDownloadUrl() {
  const value = process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL;
  if (!value) return "#try";

  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_MAC_DOWNLOAD_URL must be an HTTPS URL.");
  }
  return url.toString();
}

export function languageAlternates(path = "") {
  return {
    ...Object.fromEntries(
      locales.map((locale) => [htmlLanguages[locale], `${siteUrl}/${locale}${path}`]),
    ),
    "x-default": `${siteUrl}/en${path}`,
  };
}

export function pageMetadata(
  locale: Locale,
  title: string,
  description: string,
  path = "",
  keywords: string[] = [],
): Metadata {
  const canonical = `${siteUrl}/${locale}${path}`;
  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    keywords,
    category: "technology",
    applicationName: siteName,
    authors: [{ name: siteName, url: siteUrl }],
    creator: siteName,
    publisher: siteName,
    alternates: { canonical, languages: languageAlternates(path) },
    openGraph: {
      type: "website",
      siteName,
      locale: htmlLanguages[locale].replace("-", "_"),
      url: canonical,
      title,
      description,
      images: [{ url: "/og-card.png", width: 1200, height: 630, alt: "VidLingo subtitle workspace" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og-card.png"] },
  };
}
