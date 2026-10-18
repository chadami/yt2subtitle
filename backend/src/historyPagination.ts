import { z } from "zod";

const cursorSchema = z.object({ time: z.string().min(1).max(80), id: z.string().uuid() });
export function decodeHistoryCursor(value: unknown) {
  if (value === undefined) return null;
  try {
    if (typeof value !== "string" || value.length > 512) throw new Error();
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!Number.isFinite(Date.parse(cursor.time))) throw new Error();
    return cursor;
  } catch {
    throw Object.assign(new Error("Invalid history cursor"), { status: 400 });
  }
}
export function encodeHistoryCursor(time: string, id: string) {
  return Buffer.from(JSON.stringify({ time, id })).toString("base64url");
}
