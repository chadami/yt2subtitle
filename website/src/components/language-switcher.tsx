"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { localeNames, locales, type Locale } from "@/lib/i18n";

export function LanguageSwitcher({ locale, suffix = "" }: { locale: Locale; suffix?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`language-switcher${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="language-trigger"
        aria-label="Language selector"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{localeNames[locale]}</span>
        <span className="language-chevron" aria-hidden="true" />
      </button>
      <div className="language-menu" role="menu" aria-label="Choose a language">
        {locales.map((item) => (
          <Link
            key={item}
            href={`/${item}${suffix}`}
            hrefLang={item}
            role="menuitem"
            aria-current={item === locale ? "page" : undefined}
            className={item === locale ? "active" : undefined}
            onClick={() => setOpen(false)}
          >
            <span>{localeNames[item]}</span>
            <span className="language-code" aria-hidden="true">{item.toUpperCase()}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
