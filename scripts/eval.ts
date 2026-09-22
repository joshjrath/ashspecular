/**
 * Parser eval harness.
 *
 *   npm run eval              # every case
 *   npm run eval -- --case 04 # just the cases whose file name contains "04"
 *   npm run eval -- --verbose # dump the whole derived record for each case
 *
 * Each case in evals/cases/*.json carries the message and the fields that
 * matter. The point is a score you can watch move when the prompt changes.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../src/parse/classify.js";
import { derive, dateIn, ORG_TZ, type DerivedRecord } from "../src/parse/derive.js";

const here = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(here, "..", "evals", "cases");

interface EvalCase {
  name: string;
  why?: string;
  input: { content: string; author?: string; channelName?: string; forwardedFrom?: string };
  expect: Record<string, unknown>;
}

const args = process.argv.slice(2);
const only = valueOf("--case");
const verbose = args.includes("--verbose");

function valueOf(flag: string): string | null {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] ?? null) : null;
}

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

/** Each assertion knows how to read the derived record and say what it wanted. */
const CHECKS: Record<string, (rec: DerivedRecord, want: any) => [boolean, string]> = {
  kind: (r, w) => [r.kind === w, String(r.kind)],
  code: (r, w) => [r.code === w, String(r.code)],
  category: (r, w) => [r.category === w, String(r.category)],
  channel: (r, w) => [r.channel === w, String(r.channel)],
  tag: (r, w) => [r.tag === w, String(r.tag)],
  airDate: (r, w) => [r.airDate === w, String(r.airDate)],
  stage: (r, w) => [r.stage === w, String(r.stage)],
  wordCount: (r, w) => [r.wordCount === w, String(r.wordCount)],
  version: (r, w) => [r.version === w, String(r.version)],
  voSource: (r, w) => [r.voSource === w, r.voSource],
  voDueLocal: (r, w) => {
    const got = r.voDue ? dateIn(ORG_TZ, r.voDue) : null;
    return [got === w, String(got)];
  },
  scriptDueLocal: (r, w) => {
    const got = r.scriptDue ? dateIn(ORG_TZ, r.scriptDue) : null;
    return [got === w, String(got)];
  },
  titleContains: (r, w) => {
    const got = r.title ?? "";
    return [got.toLowerCase().includes(String(w).toLowerCase()), got || "null"];
  },
  briefNotEmpty: (r, w) => {
    const got = Boolean(r.brief && r.brief.length > 40);
    return [got === w, got ? `${r.brief!.length} chars` : "empty"];
  },
  hasFrameioLink: (r, w) => {
    const got = r.links.some((l) => l.kind === "frameio");
    return [got === w, got ? "yes" : "no"];
  },
  confidenceBelow: (r, w) => [r.confidence < Number(w), r.confidence.toFixed(2)],
};

async function loadCases(): Promise<{ file: string; body: EvalCase }[]> {
  const files = (await readdir(CASES_DIR)).filter((f) => f.endsWith(".json")).sort();
  const picked = only ? files.filter((f) => f.includes(only)) : files;
  return Promise.all(
    picked.map(async (file) => ({
      file,
      body: JSON.parse(await readFile(join(CASES_DIR, file), "utf8")) as EvalCase,
    })),
  );
}

async function main(): Promise<void> {
  const cases = await loadCases();
  if (cases.length === 0) {
    console.error(only ? `No cases matching "${only}".` : "No cases found.");
    process.exit(1);
  }

  console.log(C.bold(`\nParser eval — ${cases.length} case${cases.length === 1 ? "" : "s"}\n`));

  let passedFields = 0;
  let totalFields = 0;
  let failedCases = 0;
  let inTokens = 0;
  let outTokens = 0;
  let cacheRead = 0;
  const started = Date.now();

  for (const { file, body } of cases) {
    const result = await classify(body.input);
    const record = derive(result.extraction, result.raw);

    if (result.usage) {
      inTokens += result.usage.input;
      outTokens += result.usage.output;
      cacheRead += result.usage.cacheRead;
    }

    const rows: string[] = [];
    let caseFailed = false;

    for (const [field, want] of Object.entries(body.expect)) {
      const check = CHECKS[field];
      totalFields += 1;

      if (!check) {
        rows.push(`    ${C.yellow("?")} ${field.padEnd(16)} ${C.dim("no check defined")}`);
        caseFailed = true;
        continue;
      }

      const [ok, got] = check(record, want);
      if (ok) {
        passedFields += 1;
        rows.push(`    ${C.green("✓")} ${field.padEnd(16)} ${C.dim(got)}`);
      } else {
        caseFailed = true;
        rows.push(
          `    ${C.red("✗")} ${field.padEnd(16)} got ${C.red(got)} ${C.dim("· wanted")} ${C.cyan(String(want))}`,
        );
      }
    }

    if (caseFailed) failedCases += 1;
    const badge = caseFailed ? C.red("FAIL") : C.green("PASS");
    console.log(`${badge}  ${C.bold(body.name)} ${C.dim(`(${file})`)}`);
    if (body.why && caseFailed) console.log(`    ${C.dim(body.why)}`);
    rows.forEach((r) => console.log(r));

    if (record.warnings.length) {
      record.warnings.forEach((w) => console.log(`    ${C.yellow("!")} ${C.yellow(w)}`));
    }
    if (result.parsedBy === "rule") {
      console.log(`    ${C.yellow("!")} ${C.yellow("fell back to rules — the API call did not return")}`);
    }
    if (verbose) {
      console.log(C.dim(JSON.stringify(record, null, 2).split("\n").map((l) => `      ${l}`).join("\n")));
    }
    console.log();
  }

  const pct = totalFields ? Math.round((passedFields / totalFields) * 100) : 0;
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  console.log(C.bold("─".repeat(58)));
  console.log(
    `${C.bold("fields")}  ${passedFields}/${totalFields} (${pct}%)   ` +
      `${C.bold("cases")}  ${cases.length - failedCases}/${cases.length}   ` +
      `${C.dim(`${secs}s`)}`,
  );

  if (inTokens || outTokens) {
    // Upper bound: ignores the cheaper cache-read rate, so real spend is lower.
    const cost = (inTokens / 1e6) * 5 + (outTokens / 1e6) * 25;
    console.log(
      C.dim(
        `tokens  ${inTokens} in · ${outTokens} out · ${cacheRead} cache-read   ` +
          `≈ $${cost.toFixed(4)} upper bound for this run`,
      ),
    );
  }
  console.log();

  process.exit(failedCases > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
