import Link from "next/link";
import type { Locale, SiteCopy } from "@/lib/i18n";
import { BrandMark } from "./brand-mark";
import { LanguageSwitcher } from "./language-switcher";
import { SiteFooter } from "./site-footer";

export function LegalPage({ locale, copy, type }: { locale: Locale; copy: SiteCopy; type: "privacy" | "terms" }) {
  const isPrivacy = type === "privacy";
  const title = isPrivacy ? copy.legal.privacyTitle : copy.legal.termsTitle;
  const intro = isPrivacy ? copy.legal.privacyIntro : copy.legal.termsIntro;
  const sections = isPrivacy ? copy.legal.privacySections : copy.legal.termsSections;

  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link href={`/${locale}`}><BrandMark /></Link>
        <LanguageSwitcher locale={locale} suffix={`/${type}`} />
      </header>
      <article className="legal-article">
        <Link href={`/${locale}`} className="back-link">← {copy.legal.back}</Link>
        <p className="eyebrow">VIDLINGO · PUBLIC BETA</p>
        <h1>{title}</h1>
        <p className="legal-intro">{intro}</p>
        <p className="legal-updated">{copy.legal.updated}</p>
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </article>
      <SiteFooter locale={locale} copy={copy} />
    </main>
  );
}
