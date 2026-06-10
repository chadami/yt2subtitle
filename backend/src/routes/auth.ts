import { Router } from "express";
import { z } from "zod";
import { createRandomToken, hashToken, requireUserId, signSession } from "../auth.js";
import { query } from "../db.js";
import { sendLoginCode } from "../email.js";
import { env } from "../env.js";

export const authRouter = Router();

authRouter.post("/magic-link", async (req, res, next) => {
  try {
    const input = z.object({
      email: z.string().email(),
      clientId: z.string().min(8).optional()
    }).parse(req.body);

    const userId = input.clientId
      ? await requireUserId(undefined, input.clientId)
      : (await query<{ id: string }>("insert into users default values returning id")).rows[0].id;
    const code = createLoginCode();

    await query(
      "insert into login_codes (user_id, email, code_hash, expires_at) values ($1, $2, $3, $4)",
      [userId, input.email.toLowerCase(), hashToken(code), new Date(Date.now() + 10 * 60_000)]
    );

    await sendLoginCode(input.email, code);
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
    const code = createLoginCode();
    await query(
      "insert into login_codes (user_id, email, code_hash, expires_at) values ($1, $2, $3, $4)",
      [link.user_id, link.email, hashToken(code), new Date(Date.now() + 10 * 60_000)]
    );
    res.send(`
      <h1>Login verified</h1>
      <p>Copy this login code into the extension settings page. It expires in 10 minutes.</p>
      <pre style="font-size:32px;font-weight:700;letter-spacing:4px">${code}</pre>
    `);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/exchange-code", async (req, res, next) => {
  try {
    const input = z.object({
      code: z.string().min(6)
    }).parse(req.body);
    const codeHash = hashToken(input.code.trim().toUpperCase());
    const found = await query<{ id: string; user_id: string; email: string | null }>(
      "select id, user_id, email from login_codes where code_hash = $1 and used_at is null and expires_at > now()",
      [codeHash]
    );
    const code = found.rows[0];
    if (!code) return res.status(400).json({ error: "Invalid or expired login code" });

    await query("update login_codes set used_at = now() where id = $1", [code.id]);
    if (code.email) {
      await query(
        `insert into identities (user_id, type, identifier, verified_at)
         values ($1, 'email', $2, now())
         on conflict (type, identifier) do update set verified_at = now()`,
        [code.user_id, code.email]
      );
    }
    res.json({ sessionToken: signSession(code.user_id) });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const userId = await requireUserId(req.headers.authorization);
    const found = await query<{ email: string }>(
      `select identifier as email
       from identities
       where user_id = $1 and type = 'email'
       order by verified_at desc nulls last
       limit 1`,
      [userId]
    );
    res.json({ userId, email: found.rows[0]?.email ?? null });
  } catch (error) {
    next(error);
  }
});

function createLoginCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
