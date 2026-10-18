import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execScript } from "./db.js";

export async function initDatabase() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "backend", "db", "schema.sql"),
    path.join(process.cwd(), "db", "schema.sql"),
    path.resolve(moduleDir, "..", "db", "schema.sql"),
    path.resolve(moduleDir, "..", "..", "db", "schema.sql")
  ];

  let schema = "";
  for (const candidate of candidates) {
    try {
      schema = await fs.readFile(candidate, "utf8");
      break;
    } catch {
      // Try the next candidate.
    }
  }

  if (!schema) {
    throw new Error(`Could not find db/schema.sql (looked in: ${candidates.join(", ")})`);
  }

  await execScript(schema);
  console.log("Database schema is ready");
}
