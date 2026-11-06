import Link from "next/link";
import { copy, type Locale } from "@/lib/i18n";

export function SiteFooter({ locale }: { locale: Locale }) {
  const { footer } = copy[locale];

  return (
    <footer>
      <span>VidLingo</span>
      <nav aria-label="Legal">
        <Link href={`/${locale}/privacy`}>{footer.privacy}</Link>
        <Link href={`/${locale}/terms`}>{footer.terms}</Link>
      </nav>
    </footer>
  );
}
