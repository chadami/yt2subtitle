import Link from "next/link";
import { localeNames, locales, type Locale } from "@/lib/i18n";

export function LanguageSwitcher({ locale, suffix = "" }: { locale: Locale; suffix?: string }) {
  return (
    <div className="language-switcher" aria-label="Language selector">
      {locales.map((item) => (
        <Link
          key={item}
          href={`/${item}${suffix}`}
          hrefLang={item}
          aria-current={item === locale ? "page" : undefined}
          className={item === locale ? "active" : undefined}
        >
          {localeNames[item]}
        </Link>
      ))}
    </div>
  );
}
