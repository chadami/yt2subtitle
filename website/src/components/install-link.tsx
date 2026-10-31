export function InstallLink({ href, label, className = "button" }: { href: string; label: string; className?: string }) {
  return (
    <a className={className} href={href}>
      <span>{label}</span>
      <span aria-hidden="true">↓</span>
    </a>
  );
}
