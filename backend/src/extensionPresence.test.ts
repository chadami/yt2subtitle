import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Request, Response } from "express";

const dataDir = mkdtempSync(path.join(tmpdir(), "vidlingo-presence-"));
const presenceFile = path.join(dataDir, "extension-last-seen");
const token = "presence-test-token";
const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;
Object.assign(process.env, { PORT: "3999", DATA_DIR: dataDir, LOCAL_TOKEN: token, EXTENSION_ORIGIN: "*" });

test.after(() => rmSync(dataDir, { recursive: true, force: true }));

const { restrictLocalAccess } = await import("./localAccess.js");
const {
  extensionConnection,
  extensionLastSeenAt,
  recordExtensionContact,
  recordExtensionHeartbeat
} = await import("./extensionPresence.js");

function send(options: { path: string; origin?: string; client?: string; authorized?: boolean }) {
  const headers: Record<string, string> = { host: "127.0.0.1:3999" };
  if (options.origin) headers.origin = options.origin;
  if (options.authorized) headers.authorization = `Bearer ${token}`;
  const result = { nextCalled: false, status: 200 };
  const req = {
    headers,
    method: "GET",
    path: options.path,
    get: (name: string) => (name === "X-VidLingo-Client" ? options.client : undefined)
  } as unknown as Request;
  const res = {
    setHeader() {},
    status(code: number) {
      result.status = code;
      return this;
    },
    json() {
      return this;
    }
  } as unknown as Response;
  restrictLocalAccess(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

// One test, because these share the module's single in-memory value.
test("only extension contact is recorded, and the first contact is saved", () => {
  assert.equal(extensionLastSeenAt(), null, "starts as never connected");
  assert.equal(extensionConnection(), "never");

  assert.equal(send({ path: "/api/local/status", authorized: true }).nextCalled, true);
  assert.equal(extensionLastSeenAt(), null, "the Mac app's own polling must not count");

  assert.equal(send({ path: "/api/local/status", origin: "https://evil.example", authorized: true }).status, 403);
  assert.equal(extensionLastSeenAt(), null, "a web page must not count");

  assert.equal(send({ path: "/api/local/session" }).status, 403);
  assert.equal(extensionLastSeenAt(), null, "a session request without the client header must not count");

  assert.equal(send({ path: "/api/local/session", client: "extension" }).nextCalled, true);
  const first = extensionLastSeenAt();
  assert.ok(first, "a session request from the extension counts");
  assert.equal(readFileSync(presenceFile, "utf8"), first, "the first contact is saved");

  recordExtensionContact(new Date(Date.parse(first) + 1000));
  const second = extensionLastSeenAt();
  assert.notEqual(second, first, "memory stays current between writes");
  assert.equal(readFileSync(presenceFile, "utf8"), first, "writes are throttled");

  assert.equal(send({ path: "/health", origin: extensionOrigin }).nextCalled, true);
  assert.notEqual(extensionLastSeenAt(), second, "any request with an extension origin counts");
  assert.equal(extensionConnection(), "seen", "a version without heartbeats is not reported offline");

  const beat = new Date("2026-11-06T08:00:00.000Z");
  recordExtensionHeartbeat(beat);
  assert.equal(extensionConnection(beat.getTime() + 150_000), "online", "a delayed alarm stays online");
  assert.equal(extensionConnection(beat.getTime() + 150_001), "offline", "missed heartbeats read as offline");
  assert.equal(readFileSync(path.join(dataDir, "extension-heartbeat"), "utf8"), beat.toISOString());

  const next = new Date(beat.getTime() + 60_000);
  recordExtensionHeartbeat(next);
  assert.equal(extensionConnection(next.getTime() + 150_000), "online", "each heartbeat extends the window");
  assert.equal(
    readFileSync(path.join(dataDir, "extension-heartbeat"), "utf8"),
    beat.toISOString(),
    "only the first heartbeat is written to disk"
  );
});

test("a corrupt saved value reads as never connected", async () => {
  writeFileSync(presenceFile, "not a date");
  const reloaded = await import(`./extensionPresence.js?corrupt=${Date.now()}`);
  assert.equal(reloaded.extensionLastSeenAt(), null);
});

test("a saved heartbeat reads as offline after a restart", async () => {
  writeFileSync(path.join(dataDir, "extension-heartbeat"), "2026-11-06T07:00:00.000Z");
  const reloaded = await import(`./extensionPresence.js?heartbeat=${Date.now()}`);
  assert.equal(reloaded.extensionConnection(), "offline");
  rmSync(path.join(dataDir, "extension-heartbeat"));
});

test("a saved contact survives a restart", async () => {
  const saved = "2026-11-06T07:00:00.000Z";
  writeFileSync(presenceFile, saved);
  const reloaded = await import(`./extensionPresence.js?restart=${Date.now()}`);
  assert.equal(reloaded.extensionLastSeenAt(), saved);
});
