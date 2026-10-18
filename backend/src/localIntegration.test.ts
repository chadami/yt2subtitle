import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

test("local access, complete startup recovery and history pagination", { timeout: 60000 }, async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "vidlingo-integration-"));
  const socket = net.createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  const token = "integration-only-local-token";
  Object.assign(process.env, {
    LOCAL_MODE: "1", HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir,
    LOCAL_TOKEN: token, JWT_SECRET: "integration-only-secret-at-least-24", EXTENSION_ORIGIN: "*"
  });
  const { initDatabase } = await import("./migrate.js");
  const { query, closeDatabase } = await import("./db.js");
  const { getLocalUserId } = await import("./auth.js");
  let child: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  let logs = "";
  try {
    await initDatabase();
    const userId = await getLocalUserId();
    await query("insert into videos (video_id, url, title) values ('integration', 'https://www.youtube.com/watch?v=integration', 'Integration')");
    const captions = await query<{ id: string }>(
      "insert into caption_sources (video_id, source_lang, caption_type, raw_cues_json) values ('integration', 'en', 'manual', '[]') returning id"
    );
    // More than two recovery/history pages, with identical microsecond timestamps.
    await query(`insert into translation_jobs
      (user_id, video_id, source_lang, target_lang, caption_source_id, status, created_at)
      select $1, 'integration', 'en', 'ja', $2, 'queued', '2026-01-01 00:00:00.123456+00'::timestamptz
      from generate_series(1, 205)`, [userId, captions.rows[0].id]);
    const other = await query<{ id: string }>("insert into users default values returning id");
    await query(`insert into translation_jobs (user_id, video_id, source_lang, target_lang, caption_source_id, status)
      values ($1, 'integration', 'en', 'ja', $2, 'completed')`, [other.rows[0].id, captions.rows[0].id]);
    await closeDatabase();
    // No worker handler: recovered jobs remain pending for an exact count.
    child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("server.ts", import.meta.url))], {
      env: process.env, stdio: ["ignore", "pipe", "pipe"]
    });
    exited = new Promise((resolve) => child!.once("exit", resolve));
    child.stdout?.on("data", (chunk) => { logs += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { logs += chunk.toString(); });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { ready = (await fetch(`${base}/health`)).ok; } catch { /* Starting. */ }
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, logs);
    const origin = `chrome-extension://${"a".repeat(32)}`;
    const client = { Origin: origin, "X-VidLingo-Client": "extension" };
    for (const badOrigin of ["https://example.org", "https://www.youtube.com", "null"]) {
      const response = await fetch(`${base}/api/local/session`, { headers: { ...client, Origin: badOrigin } });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
    assert.equal((await fetch(`${base}/api/local/session`)).status, 403);
    const session = await fetch(`${base}/api/local/session`, { headers: client });
    assert.equal(session.status, 200);
    assert.equal(session.headers.get("access-control-allow-origin"), origin);
    assert.equal(session.headers.get("cache-control"), "no-store");
    assert.equal((await session.json()).token, token);
    const preflight = await fetch(`${base}/api/local/session`, { method: "OPTIONS", headers: {
      Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-vidlingo-client"
    } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-headers") || "", /x-vidlingo-client/i);
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/api/local/preferences`)).status, 401);
    assert.equal((await fetch(`${base}/api/jobs/history`, { headers: { Authorization: "Bearer wrong" } })).status, 401);
    assert.equal((await fetch(`${base}/api/local/status`)).status, 401);
    const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
      http.get(`${base}/health`, { headers: { Host: `evil.example:${port}` } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on("error", reject);
    });
    assert.equal(reboundStatus, 403);
    const deniedWrite = await fetch(`${base}/api/local/preferences`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"targetLang":"ja"}' });
    assert.equal(deniedWrite.status, 401);
    const write = await fetch(`${base}/api/local/preferences`, { method: "PUT", headers: auth, body: JSON.stringify({ targetLang: "ja", showSourceText: false }) });
    assert.equal(write.status, 200);
    assert.deepEqual(await write.json(), { targetLang: "ja", showSourceText: false });
    const status = await (await fetch(`${base}/api/local/status`, { headers: auth })).json();
    assert.equal(status.queue.pending, 205);
    assert.match(logs, /Requeued 205 interrupted job/);
    let cursor: string | null = null;
    const ids: string[] = [];
    const sizes: number[] = [];
    do {
      const response: Response = await fetch(`${base}/api/jobs/history${cursor ? `?cursor=${cursor}` : ""}`, { headers: auth });
      assert.equal(response.status, 200, await response.clone().text());
      const page: { total: number; history: Array<{ jobId: string }>; nextCursor: string | null } = await response.json();
      assert.equal(page.total, 205);
      sizes.push(page.history.length);
      ids.push(...page.history.map((row: { jobId: string }) => row.jobId));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(sizes, [100, 100, 5]);
    assert.equal(new Set(ids).size, 205);
    assert.equal((await fetch(`${base}/api/jobs/history?cursor=invalid`, { headers: auth })).status, 400);
  } finally {
    if (child && child.exitCode === null) { child.kill("SIGTERM"); await exited; }
    await closeDatabase().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
});
