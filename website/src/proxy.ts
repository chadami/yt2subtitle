import { NextResponse, type NextRequest } from "next/server";

export function localeForCountry(country: string | null) {
  const value = country?.trim().toUpperCase();
  if (value === "CN") return "zh";
  if (value === "JP") return "ja";
  return "en";
}

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = `/${localeForCountry(request.headers.get("x-vercel-ip-country"))}`;

  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "X-Vercel-IP-Country");
  return response;
}

export const config = { matcher: ["/"] };
