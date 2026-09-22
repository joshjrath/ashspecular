/**
 * Parse one message from stdin or an argument and print the record.
 *
 *   npm run parse -- "torch is only at 3 today"
 *   pbpaste | npm run parse
 *
 * For trying a real Discord post without adding it to the eval set.
 */
import { classify } from "../src/parse/classify.js";
import { derive, renderBothZones } from "../src/parse/derive.js";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const content = (process.argv.slice(2).join(" ") || (await readStdin())).trim();
if (!content) {
  console.error('Give me a message: npm run parse -- "your text", or pipe it in.');
  process.exit(1);
}

const result = await classify({ content, author: "you", channelName: "intake" });
const record = derive(result.extraction, result.raw);

console.log(JSON.stringify(record, null, 2));

if (record.voDue) {
  const { org, team } = renderBothZones(record.voDue);
  console.log(`\nVO due (${record.voSource}):  ${org}  ·  ${team}`);
}
if (record.scriptDue) {
  const { org, team } = renderBothZones(record.scriptDue);
  console.log(`Script due:            ${org}  ·  ${team}`);
}
if (record.warnings.length) console.log(`\nwarnings: ${record.warnings.join("; ")}`);
