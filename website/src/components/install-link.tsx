export function InstallLink({ href, label, className = "button" }: { href: string; label: string; className?: string }) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      <span>{label}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
