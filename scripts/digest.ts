/**
 * Preview the digest without posting it.
 *
 *   npm run digest
 *
 * Prints what today's message would say. Reads the database; sends nothing.
 */
import { buildDigest } from "../src/jobs/digest.js";
import { migrate } from "../src/db/migrate.js";
import { pool } from "../src/db/pool.js";
import { ORG_TZ, renderIn } from "../src/parse/derive.js";

await migrate();
const d = await buildDigest();

const show = (r: { code: string | null; title: string | null; channel: string | null; voDue: Date | null; deadline: Date | null; voSource: string }) => {
  const at = r.voDue ?? r.deadline;
  return `  ${r.code ? `${r.code} ` : ""}${r.title ?? "(untitled)"}${r.channel ? ` · ${r.channel}` : ""}\n    ${
    at ? renderIn(at, ORG_TZ, "ET") : "no deadline"
  }${r.voSource === "calculated" ? "  (air − 6d)" : ""}`;
};

console.log(`\n${d.date}\n`);
console.log(`Voiceover — next ${d.priorities.length}`);
console.log(d.priorities.map(show).join("\n") || "  nothing");
console.log(`\nLate · ${d.late.length}`);
console.log(d.late.slice(0, 5).map(show).join("\n") || "  nothing");
console.log(`\nDue today · ${d.dueToday.length}`);
console.log(d.dueToday.slice(0, 5).map(show).join("\n") || "  nothing");
console.log(`\nBits · ${d.batches.done}/${d.batches.total} cleared${d.batches.late ? `, ${d.batches.late} past their time` : ""}\n`);

await pool.end();
