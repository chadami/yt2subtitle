import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InstallLink } from "@/components/install-link";
import { ProviderLogos, ProviderMarquee } from "@/components/provider-marquee";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SpeedRace } from "@/components/speed-race";
import { SubtitleCompare } from "@/components/subtitle-compare";
import { demoClips } from "@/lib/demo-clips";
import { copy, isLocale } from "@/lib/i18n";
import { getDownloadUrl, pageMetadata } from "@/lib/site";
import "../comparison.css";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const content = copy[locale];
  return pageMetadata(locale, content.meta.title, content.meta.description, "", content.meta.keywords);
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const content = copy[locale];
  const downloadUrl = getDownloadUrl(locale);

  return (
    <main className="home-page glass-peach-theme">
      <ScrollReveal />
      <SiteHeader locale={locale} copy={content} downloadUrl={downloadUrl} />

      <section className="hero section-shell">
        <div className="hero-copy reveal reveal-one">
          <p className="eyebrow"><span />{content.hero.eyebrow}</p>
          <h1><span className="hero-title-line">{content.hero.title}</span><br /><em>{content.hero.accent}</em></h1>
          <p className="hero-description">{content.hero.description}</p>
          <div className="hero-actions">
            <InstallLink href={downloadUrl} label={content.hero.cta} />
            <span className="button-note">{content.hero.note}</span>
          </div>
          <ProviderMarquee label={content.byok.providersLabel} />
        </div>
        <div className="demo-wrap compare-wrap reveal reveal-two">
          <SubtitleCompare clips={demoClips} copy={content.compare} locale={locale} />
          <p className="compare-hint">{content.compare.hint}</p>
        </div>
      </section>

      <section className="section-shell quality-section" id="features">
        <div className="section-intro" data-reveal>
          <p className="eyebrow">{content.quality.eyebrow}</p>
          <h2>{content.quality.title}</h2>
          <p>{content.quality.description}</p>
        </div>
        <div className="quality-grid">
          {content.quality.points.map((point, index) => {
            const example = demoClips[index]?.highlight;
            return (
              <article className="quality-card" data-reveal key={point.title}>
                <span className="quality-index">0{index + 1}</span>
                <h3>{point.title}</h3>
                <p>{point.description}</p>
                {example && (
                  <dl className="quality-example">
                    <div className="example-original"><dt>{content.quality.originalLabel}</dt><dd lang="en">{example.original}</dd></div>
                    <div className="example-youtube"><dt>{content.compare.youtubeLabel}</dt><dd>{example.youtube}</dd></div>
                    <div className="example-vidlingo"><dt>{content.compare.vidlingoLabel}</dt><dd>{example.vidlingo}</dd></div>
                  </dl>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="section-shell speed-section" id="speed">
        <div className="section-intro" data-reveal>
          <p className="eyebrow">{content.speed.eyebrow}</p>
          <h2>{content.speed.title}</h2>
          <p>{content.speed.description}</p>
        </div>
        <div data-reveal><SpeedRace copy={content.speed} /></div>
        <ul className="speed-facts">
          {content.speed.facts.map((fact) => (
            <li data-reveal key={fact.title}><h3>{fact.title}</h3><p>{fact.description}</p></li>
          ))}
        </ul>
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
          <InstallLink href={downloadUrl} label={content.finalCta.button} className="button button-light" />
          <span className="final-orbit orbit-a" /><span className="final-orbit orbit-b" />
        </div>
      </section>

      <SiteFooter locale={locale} copy={content} />
    </main>
  );
}
