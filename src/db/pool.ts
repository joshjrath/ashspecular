import pg from "pg";
import { env } from "../env.js";

// Railway/Render managed Postgres terminates TLS with a cert the default CA
// bundle does not chain to, so verification is relaxed only for those hosts.
const needsSsl = /\b(railway|render|neon|supabase)\b/i.test(env.databaseUrl);

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 8,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[db] idle client error", err);
});
