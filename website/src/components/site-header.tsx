"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale, SiteCopy } from "@/lib/i18n";
import { BrandMark } from "./brand-mark";
import { InstallLink } from "./install-link";
import { LanguageSwitcher } from "./language-switcher";

export function SiteHeader({
  locale,
  copy,
  downloadUrl,
  languageSuffix = "",
}: {
  locale: Locale;
  copy: SiteCopy;
  downloadUrl: string;
  languageSuffix?: string;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateHeader = () => setScrolled(window.scrollY > 24);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="header-inner">
        <Link href={`/${locale}`} className="brand-link"><BrandMark /></Link>
        <nav aria-label={copy.nav.aria} className="desktop-nav">
          <Link href={`/${locale}#features`}>{copy.nav.features}</Link>
          <Link href={`/${locale}#how`}>{copy.nav.how}</Link>
          <Link href={`/${locale}#byok`}>{copy.nav.privacy}</Link>
        </nav>
        <div className="header-actions">
          <LanguageSwitcher locale={locale} suffix={languageSuffix} />
          <InstallLink href={downloadUrl} label={copy.nav.install} className="button button-small" />
        </div>
      </div>
    </header>
  );
}
