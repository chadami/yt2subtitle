import type { RequestHandler } from "express";
import { env } from "./env.js";
import { isLocalToken } from "./auth.js";

export function isExtensionOrigin(origin: string) {
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
    && (env.EXTENSION_ORIGIN === "*" || origin === env.EXTENSION_ORIGIN);
}

// Check Host before processing requests to prevent DNS rebinding. A browser page
// cannot forge Origin or send our custom session header without a preflight.
export const restrictLocalAccess: RequestHandler = (req, res, next) => {
  const host = req.headers.host;
  if (!host || ![`127.0.0.1:${env.PORT}`, `localhost:${env.PORT}`].includes(host.toLowerCase())) {
    res.status(403).json({ error: "Invalid local host" });
    return;
  }
  const origin = req.headers.origin;
  if (origin && !isExtensionOrigin(origin)) {
    res.status(403).json({ error: "Browser origin is not allowed" });
    return;
  }
  if (req.method === "OPTIONS" || req.path === "/health") return next();
  if (req.path === "/api/local/session" && req.method === "GET") {
    if (req.get("X-VidLingo-Client") !== "extension") {
      res.status(403).json({ error: "Connect using the VidLingo extension" });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    return next();
  }
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!isLocalToken(token)) {
    res.status(401).json({ error: "Missing or invalid local token" });
    return;
  }
  next();
};
