import { NextResponse, type NextRequest } from "next/server";

function preferredLocale(header: string | null) {
  const value = (header || "").toLowerCase();
  if (/(^|,)\s*zh(?:-|;|,|$)/.test(value)) return "zh";
  if (/(^|,)\s*ja(?:-|;|,|$)/.test(value)) return "ja";
  return "en";
}

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  if (url.pathname === "/") {
    url.pathname = `/${preferredLocale(request.headers.get("accept-language"))}`;
    return NextResponse.redirect(url, 307);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/:path*"] };
