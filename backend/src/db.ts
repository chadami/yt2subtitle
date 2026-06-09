import pg from "pg";
import { env } from "./env.js";

export const db = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  const result = await db.query<T>(text, values);
  return result;
}
