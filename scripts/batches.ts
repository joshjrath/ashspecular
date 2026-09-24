/**
 * Open the daily bits batches by hand.
 *
 *   npm run batches            today
 *   npm run batches -- tomorrow
 *   npm run batches -- 2026-10-01
 *
 * Safe to run any number of times: batches are keyed by channel, date and
 * index, so a second run finds them already there.
 */
import { openBatchesFor, tomorrow } from "../src/jobs/batches.js";
import { migrate } from "../src/db/migrate.js";
import { pool } from "../src/db/pool.js";
import { ORG_TZ, dateIn } from "../src/parse/derive.js";

const arg = process.argv[2];
const date = !arg ? dateIn(ORG_TZ) : arg === "tomorrow" ? tomorrow() : arg;

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`Not a date: ${date}. Use YYYY-MM-DD, or "tomorrow".`);
  process.exit(1);
}

await migrate();
const result = await openBatchesFor(date);
console.log(
  `${result.date}: opened ${result.opened}${
    result.alreadyThere ? `, ${result.alreadyThere} already there` : ""
  }`,
);
await pool.end();
