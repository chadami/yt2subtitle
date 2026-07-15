export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="VidLingo">
      <svg className="brand-mark" viewBox="0 0 40 40" role="img" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="currentColor" />
        <path d="M11.5 13.5a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-9Z" fill="#fff" />
        <path d="m18 15 6 3.5-6 3.5v-7Z" fill="currentColor" />
        <path d="M14.5 29h7M24 29h2" stroke="#dff0e8" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      {!compact && <span className="brand-name">VidLingo</span>}
    </span>
  );
}
