import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import { query } from "./db.js";

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createRandomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function signSession(userId: string) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "90d" });
}

export async function resolveAnonymousUser(clientId: string) {
  const existing = await query<{ user_id: string }>(
    "select user_id from identities where type = 'anonymous' and identifier = $1",
    [clientId]
  );
  if (existing.rows[0]) return existing.rows[0].user_id;

  const created = await query<{ id: string }>(
    "insert into users default values returning id"
  );
  const userId = created.rows[0].id;
  await query(
    "insert into identities (user_id, type, identifier) values ($1, 'anonymous', $2)",
    [userId, clientId]
  );
  return userId;
}

export async function requireUserId(authHeader: string | undefined, clientId?: string) {
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    return payload.sub;
  }
  if (clientId) return resolveAnonymousUser(clientId);
  throw new Error("Missing auth token or clientId");
}
