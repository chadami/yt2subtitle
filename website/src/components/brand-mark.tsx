import Image from "next/image";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="VidLingo">
      <Image className="brand-mark" src="/vidlingo-icon.png" width={128} height={128} alt="" aria-hidden="true" priority />
      {!compact && <span className="brand-name">VidLingo</span>}
    </span>
  );
}
