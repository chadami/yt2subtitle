import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InstallLink } from "@/components/install-link";
import { ProductDemo } from "@/components/product-demo";
import { ProviderLogos, ProviderMarquee } from "@/components/provider-marquee";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { copy, isLocale } from "@/lib/i18n";
import { getChromeWebStoreUrl, pageMetadata } from "@/lib/site";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const content = copy[locale];
  return pageMetadata(locale, content.meta.title, content.meta.description);
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const content = copy[locale];
  const storeUrl = getChromeWebStoreUrl();

  return (
    <main className="home-page glass-peach-theme">
      <ScrollReveal />
      <SiteHeader locale={locale} copy={content} storeUrl={storeUrl} />

      <section className="hero section-shell">
        <div className="hero-copy reveal reveal-one">
          <p className="eyebrow"><span />{content.hero.eyebrow}</p>
          <h1><span className="hero-title-line">{content.hero.title}</span><br /><em>{content.hero.accent}</em></h1>
          <p className="hero-description">{content.hero.description}</p>
          <div className="hero-actions">
            <InstallLink href={storeUrl} label={content.hero.cta} />
            <span className="button-note">{content.hero.note}</span>
          </div>
          <ProviderMarquee label={content.byok.providersLabel} />
        </div>
        <div className="demo-wrap reveal reveal-two"><ProductDemo copy={content.demo} /></div>
      </section>

      <section className="section-shell feature-section" id="features">
        <div className="section-intro" data-reveal>
          <p className="eyebrow">{content.intro.eyebrow}</p>
          <h2>{content.intro.title}</h2>
          <p>{content.intro.description}</p>
        </div>
        <div className="feature-grid">
          {content.features.map((feature) => (
            <article className="feature-card" data-reveal key={feature.number}>
              <span>{feature.number}</span><h3>{feature.title}</h3><p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="section-shell">
          <div className="how-heading" data-reveal><p className="eyebrow light">{content.how.eyebrow}</p><h2>{content.how.title}</h2></div>
          <ol className="steps" data-reveal>
            {content.how.steps.map((step, index) => (
              <li key={step.title}><span>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section-shell byok-section" id="byok">
        <div className="byok-copy" data-reveal>
          <p className="eyebrow">{content.byok.eyebrow}</p>
          <h2>{content.byok.title}</h2>
          <p className="byok-description">{content.byok.description}</p>
        </div>
        <div className="security-card" data-reveal>
          <div className="key-visual" aria-hidden="true"><span>sk</span><i /><i /><i /><i /><b>✓</b></div>
          <ul>{content.byok.points.map((point) => <li key={point}><span>✓</span>{point}</li>)}</ul>
        </div>
        <div className="provider-row" data-reveal><span>{content.byok.providersLabel}</span><ProviderLogos /></div>
      </section>

      <section className="section-shell faq-section">
        <div className="faq-heading" data-reveal><p className="eyebrow">{content.faq.eyebrow}</p><h2>{content.faq.title}</h2></div>
        <div className="faq-list" data-reveal>
          {content.faq.items.map((item, index) => (
            <details key={item.question} open={index === 0}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>
          ))}
        </div>
      </section>

      <section className="section-shell final-section">
        <div className="final-panel" data-reveal>
          <p className="eyebrow light">{content.finalCta.eyebrow}</p>
          <h2>{content.finalCta.title}</h2>
          <p>{content.finalCta.description}</p>
          <InstallLink href={storeUrl} label={content.finalCta.button} className="button button-light" />
          <span className="final-orbit orbit-a" /><span className="final-orbit orbit-b" />
        </div>
      </section>

      <SiteFooter locale={locale} copy={content} />
    </main>
  );
}
