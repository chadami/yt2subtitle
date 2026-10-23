import fs from "node:fs";
import path from "node:path";
import { env } from "./env.js";

export type QueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number;
};

export type DbClient = {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  release(): void;
};

type LocalEngine = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; affectedRows?: number }>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
};

/**
 * PGlite exposes a single connection, so every statement has to be serialized.
 * Transactions additionally block all other statements until release() is called,
 * which keeps BEGIN/COMMIT blocks from interleaving with other requests.
 */
class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = previous.then(() => gate);
    await previous;
    return release;
  }
}

const mutex = new Mutex();
let localEnginePromise: Promise<LocalEngine> | null = null;

async function getLocalEngine(): Promise<LocalEngine> {
  if (!localEnginePromise) {
    localEnginePromise = (async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
      const dataDir = path.join(env.DATA_DIR, "pgdata");
      fs.mkdirSync(dataDir, { recursive: true });
      const engine = new PGlite(dataDir, {
        extensions: { pgcrypto }
      }) as unknown as LocalEngine & { waitReady?: Promise<void> };
      await engine.waitReady;
      return engine;
    })();
  }
  return localEnginePromise;
}

async function localQuery<T>(text: string, values: unknown[]): Promise<QueryResult<T>> {
  const engine = await getLocalEngine();
  const result = await engine.query<T>(text, values);
  return {
    rows: result.rows ?? [],
    rowCount: result.rows?.length || result.affectedRows || 0
  };
}

export async function query<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  const release = await mutex.acquire();
  try { return await localQuery<T>(text, values); } finally { release(); }
}

export const db = {
  async connect(): Promise<DbClient> {
    const release = await mutex.acquire();
    return { query: <T>(text: string, values: unknown[] = []) => localQuery<T>(text, values), release };
  }
};

export async function execScript(sql: string): Promise<void> {
  const release = await mutex.acquire();
  try { await (await getLocalEngine()).exec(sql); } finally { release(); }
}

export async function closeDatabase(): Promise<void> {
  if (localEnginePromise) await (await localEnginePromise).close();
}
