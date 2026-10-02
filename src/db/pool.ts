import pg from "pg";
import { config } from "../config.js";

// Railway/Render managed Postgres terminates TLS with a cert the default CA
// bundle does not chain to, so verification is relaxed only for those hosts.
const needsSsl = /\b(railway|render|neon|supabase)\b/i.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 8,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[db] idle client error", err);
});

/** Something to run queries on: the pool, or the one connection inside a transaction. */
export type Db = Pick<pg.Pool, "query">;

/**
 * Run `work` as one transaction on one connection: all of it is saved, or —
 * when anything in it throws — none of it. Queries inside must use the `db`
 * handed in, not the pool, or they run outside the transaction.
 */
export async function inTransaction<T>(work: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
