import Link from "next/link";
import { localeNames, locales, type Locale, type SiteCopy } from "@/lib/i18n";
import { BrandMark } from "./brand-mark";
import { SiteFooter } from "./site-footer";

export function LegalPage({ locale, copy, type }: { locale: Locale; copy: SiteCopy; type: "privacy" | "terms" }) {
  const isPrivacy = type === "privacy";
  const title = isPrivacy ? copy.legal.privacyTitle : copy.legal.termsTitle;
  const intro = isPrivacy ? copy.legal.privacyIntro : copy.legal.termsIntro;
  const sections = isPrivacy ? copy.legal.privacySections : copy.legal.termsSections;

  return (
    <div className="page">
      <header>
        <BrandMark />
        <nav className="languages" aria-label="Language">
          {locales.map((item) => (
            <Link
              key={item}
              href={`/${item}/${type}`}
              hrefLang={item}
              aria-current={item === locale ? "page" : undefined}
            >
              {localeNames[item]}
            </Link>
          ))}
        </nav>
      </header>

      <main>
        <section>
          <h1>{title}</h1>
          <p>{intro}</p>
          <p className="updated">{copy.legal.updated}</p>
        </section>

        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
