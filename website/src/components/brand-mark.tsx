import Image from "next/image";
import Link from "next/link";

export function BrandMark() {
  return (
    <Link href="/" className="brand">
      <Image src="/vidlingo-icon.png" width={26} height={26} alt="" priority />
      VidLingo
    </Link>
  );
}
