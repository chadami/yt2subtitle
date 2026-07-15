"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale, SiteCopy } from "@/lib/i18n";
import { BrandMark } from "./brand-mark";
import { InstallLink } from "./install-link";
import { LanguageSwitcher } from "./language-switcher";

export function SiteHeader({ locale, copy, storeUrl }: { locale: Locale; copy: SiteCopy; storeUrl: string }) {
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
          <a href="#features">{copy.nav.features}</a>
          <a href="#how">{copy.nav.how}</a>
          <a href="#byok">{copy.nav.privacy}</a>
        </nav>
        <div className="header-actions">
          <LanguageSwitcher locale={locale} />
          <InstallLink href={storeUrl} label={copy.nav.install} className="button button-small" />
        </div>
      </div>
    </header>
  );
}
