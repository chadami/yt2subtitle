import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstallLink } from "@/components/install-link";
import { JsonLd } from "@/components/json-ld";
import { ProductDemo } from "@/components/product-demo";
import { ProviderLogos } from "@/components/provider-marquee";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { copy, isLocale, locales, type Locale } from "@/lib/i18n";
import { isSeoPageSlug, seoPages, seoPageSlugs } from "@/lib/seo-pages";
import { getChromeWebStoreUrl, pageMetadata, siteUrl } from "@/lib/site";

type PageProps = { params: Promise<{ locale: string; seoSlug: string }> };

const homeLabels: Record<Locale, string> = {
  en: "Home",
  zh: "首页",
  ja: "ホーム",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) => seoPageSlugs.map((seoSlug) => ({ locale, seoSlug })));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, seoSlug } = await params;
  if (!isLocale(locale) || !isSeoPageSlug(seoSlug)) return {};
  const content = seoPages[seoSlug].copy[locale];
  return pageMetadata(locale, content.meta.title, content.meta.description, `/${seoSlug}`, content.meta.keywords);
}

export default async function SeoLandingPage({ params }: PageProps) {
  const { locale, seoSlug } = await params;
  if (!isLocale(locale) || !isSeoPageSlug(seoSlug)) notFound();

  const siteCopy = copy[locale];
  const page = seoPages[seoSlug];
  const content = page.copy[locale];
  const storeUrl = getChromeWebStoreUrl();
  const canonical = `${siteUrl}/${locale}/${seoSlug}`;
  const related = seoPageSlugs.filter((slug) => slug !== seoSlug);

  return (
    <main className="home-page seo-page">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: homeLabels[locale], item: `${siteUrl}/${locale}` },
            { "@type": "ListItem", position: 2, name: content.shortTitle, item: canonical },
          ],
        }}
      />
      <SiteHeader locale={locale} copy={siteCopy} storeUrl={storeUrl} languageSuffix={`/${seoSlug}`} />

      <article>
        <header className="seo-hero section-shell">
          <nav className="seo-breadcrumb" aria-label="Breadcrumb">
            <Link href={`/${locale}`}>{homeLabels[locale]}</Link><span aria-hidden="true">/</span><span>{content.shortTitle}</span>
          </nav>
          <p className="eyebrow">{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p className="seo-lead">{content.introduction}</p>
          <InstallLink href={storeUrl} label={siteCopy.hero.cta} />
        </header>

        <section className="seo-highlight-shell section-shell" aria-label={content.eyebrow}>
          {content.highlights.map((highlight, index) => (
            <article className="seo-highlight" key={highlight.title}>
              <span>0{index + 1}</span><h2>{highlight.title}</h2><p>{highlight.description}</p>
            </article>
          ))}
        </section>

        <section className="seo-demo section-shell">
          <ProductDemo copy={siteCopy.demo} />
        </section>

        <div className="seo-content section-shell">
          {content.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <div>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
            </section>
          ))}
        </div>

        {seoSlug === "ai-providers" && (
          <section className="seo-provider-panel section-shell" aria-label={siteCopy.byok.providersLabel}>
            <p className="eyebrow">{siteCopy.byok.providersLabel}</p>
            <ProviderLogos />
          </section>
        )}

        <section className="seo-faq section-shell">
          <div><p className="eyebrow">FAQ</p><h2>{content.faqTitle}</h2></div>
          <div className="faq-list">
            {content.faq.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>{item.question}<span aria-hidden="true">+</span></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="seo-related section-shell">
          <p className="eyebrow">{content.relatedTitle}</p>
          <div>
            {related.map((slug) => (
              <Link href={`/${locale}/${slug}`} key={slug}>
                <span>{seoPages[slug].copy[locale].shortTitle}</span><span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="section-shell final-section seo-final">
          <div className="final-panel">
            <p className="eyebrow light">{siteCopy.finalCta.eyebrow}</p>
            <h2>{content.ctaTitle}</h2>
            <p>{content.ctaDescription}</p>
            <InstallLink href={storeUrl} label={siteCopy.finalCta.button} className="button button-light" />
          </div>
        </section>
      </article>

      <SiteFooter locale={locale} copy={siteCopy} />
    </main>
  );
}
