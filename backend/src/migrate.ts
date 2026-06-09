import fs from "node:fs/promises";
import path from "node:path";
import { query } from "./db.js";

export async function initDatabase() {
  const candidates = [
    path.join(process.cwd(), "backend", "db", "schema.sql"),
    path.join(process.cwd(), "db", "schema.sql")
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
    throw new Error("Could not find backend/db/schema.sql");
  }

  await query(schema);
  console.log("Database schema is ready");
}
