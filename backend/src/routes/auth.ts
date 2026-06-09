import { Router } from "express";
import { z } from "zod";
import { createRandomToken, hashToken, requireUserId, signSession } from "../auth.js";
import { query } from "../db.js";
import { sendMagicLink } from "../email.js";
import { env } from "../env.js";

export const authRouter = Router();

authRouter.post("/magic-link", async (req, res, next) => {
  try {
    const input = z.object({
      email: z.string().email(),
      clientId: z.string().min(8).optional()
    }).parse(req.body);

    const token = createRandomToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + env.MAGIC_LINK_TTL_MINUTES * 60_000);
    const userId = input.clientId
      ? await requireUserId(undefined, input.clientId)
      : (await query<{ id: string }>("insert into users default values returning id")).rows[0].id;

    await query(
      "insert into magic_links (user_id, email, token_hash, expires_at) values ($1, $2, $3, $4)",
      [userId, input.email.toLowerCase(), tokenHash, expiresAt]
    );

    const link = `${env.PUBLIC_APP_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
    await sendMagicLink(input.email, link);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/verify", async (req, res, next) => {
  try {
    const token = z.string().min(10).parse(req.query.token);
    const tokenHash = hashToken(token);
    const found = await query<{ id: string; user_id: string; email: string }>(
      "select id, user_id, email from magic_links where token_hash = $1 and used_at is null and expires_at > now()",
      [tokenHash]
    );
    const link = found.rows[0];
    if (!link) return res.status(400).send("Invalid or expired login link.");

    await query("update magic_links set used_at = now() where id = $1", [link.id]);
    await query(
      `insert into identities (user_id, type, identifier, verified_at)
       values ($1, 'email', $2, now())
       on conflict (type, identifier) do update set verified_at = now()`,
      [link.user_id, link.email]
    );
    const session = signSession(link.user_id);
    if (env.EXTENSION_ORIGIN.startsWith("chrome-extension://")) {
      res.redirect(`${env.EXTENSION_ORIGIN}/options.html#token=${encodeURIComponent(session)}`);
      return;
    }
    res.send(`
      <h1>Login verified</h1>
      <p>Your extension origin is not configured yet. Copy this token into the extension after setup:</p>
      <textarea style="width:100%;height:160px">${session}</textarea>
    `);
  } catch (error) {
    next(error);
  }
});
