import crypto from "node:crypto";
import { env } from "./env.js";
import { query } from "./db.js";

export class AuthError extends Error {
  status = 401;
  constructor(message = "请在插件设置中重新连接 VidLingo 本机应用。") { super(message); }
}

const LOCAL_IDENTITY = "local-device";
let localUserId: string | null = null;
let localUserPromise: Promise<string> | null = null;

export function isLocalToken(token: string | undefined) {
  if (!token) return false;
  const supplied = Buffer.from(token);
  const expected = Buffer.from(env.LOCAL_TOKEN);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

/** The single local user used by the desktop app (no email sign-in). */
export async function getLocalUserId(): Promise<string> {
  if (localUserId) return localUserId;
  if (!localUserPromise) {
    localUserPromise = (async () => {
      const existing = await query<{ user_id: string }>(
        "select user_id from identities where type = 'anonymous' and identifier = $1",
        [LOCAL_IDENTITY]
      );
      if (existing.rows[0]) return existing.rows[0].user_id;

      const created = await query<{ id: string }>("insert into users default values returning id");
      const userId = created.rows[0].id;
      await query(
        `insert into identities (user_id, type, identifier)
         values ($1, 'anonymous', $2)
         on conflict (type, identifier) do nothing`,
        [userId, LOCAL_IDENTITY]
      );
      return userId;
    })().then((userId) => {
      localUserId = userId;
      return userId;
    });
  }
  return localUserPromise;
}


export async function requireUserId(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ") || !isLocalToken(authHeader.slice(7))) throw new AuthError();
  return getLocalUserId();
}
