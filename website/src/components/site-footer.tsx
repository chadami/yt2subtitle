import Link from "next/link";
import type { Locale, SiteCopy } from "@/lib/i18n";
import { seoPages, seoPageSlugs } from "@/lib/seo-pages";
import { BrandMark } from "./brand-mark";

export function SiteFooter({ locale, copy }: { locale: Locale; copy: SiteCopy }) {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div><BrandMark /><p>{copy.footer.product}</p></div>
        <div className="footer-links">
          <div>
            {seoPageSlugs.map((slug) => (
              <Link href={`/${locale}/${slug}`} key={slug}>{seoPages[slug].copy[locale].shortTitle}</Link>
            ))}
          </div>
          <div>
            <Link href={`/${locale}/privacy`}>{copy.footer.privacy}</Link>
            <Link href={`/${locale}/terms`}>{copy.footer.terms}</Link>
          </div>
        </div>
      </div>
      <div className="footer-bottom"><span>© 2026 VidLingo</span><span>{copy.footer.beta}</span></div>
    </footer>
  );
}
