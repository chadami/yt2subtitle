import fs from "node:fs";
import path from "node:path";
import { env } from "./env.js";

const WRITE_INTERVAL_MS = 60_000;
// The extension reports once a minute, and Chrome may delay an alarm slightly.
const HEARTBEAT_FRESH_MS = 150_000;
const presenceFile = path.join(env.DATA_DIR, "extension-last-seen");
const heartbeatFile = path.join(env.DATA_DIR, "extension-heartbeat");

let lastSeenAt = readStoredTime(presenceFile);
let lastWriteAt = 0;
let lastHeartbeatAt = readStoredTime(heartbeatFile);
let heartbeatSaved = false;

export type ExtensionConnection =
  | "never" // has never contacted this app
  | "seen" // connected before, but its version does not send heartbeats
  | "online"
  | "offline"; // sends heartbeats, but none recently: browser closed, or extension disabled or removed

function readStoredTime(file: string): string | null {
  try {
    const value = fs.readFileSync(file, "utf8").trim();
    return Number.isNaN(Date.parse(value)) ? null : value;
  } catch {
    return null;
  }
}

function saveTime(file: string, value: string) {
  try {
    fs.writeFileSync(file, value);
  } catch (error) {
    console.warn(`Could not save extension contact time: ${error instanceof Error ? error.message : error}`);
  }
}

// Called on the request path, so a failed write must never fail the request.
export function recordExtensionContact(now = new Date()) {
  lastSeenAt = now.toISOString();
  if (now.getTime() - lastWriteAt < WRITE_INTERVAL_MS) return;
  lastWriteAt = now.getTime();
  saveTime(presenceFile, lastSeenAt);
}

export function recordExtensionHeartbeat(now = new Date()) {
  lastHeartbeatAt = now.toISOString();
  // Only the fact that this version sends heartbeats must survive a restart. A
  // saved time is stale by then, so the status reads offline until the next report.
  if (heartbeatSaved) return;
  heartbeatSaved = true;
  saveTime(heartbeatFile, lastHeartbeatAt);
}

export function extensionLastSeenAt() {
  return lastSeenAt;
}

export function extensionConnection(now = Date.now()): ExtensionConnection {
  if (lastHeartbeatAt) {
    return now - Date.parse(lastHeartbeatAt) <= HEARTBEAT_FRESH_MS ? "online" : "offline";
  }
  return lastSeenAt ? "seen" : "never";
}
