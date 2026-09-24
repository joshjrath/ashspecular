/**
 * Preflight check — run this before the bot.
 *
 *   npm run doctor
 *
 * Checks each thing that can be wrong, separately, so a silent Discord
 * channel doesn't leave you guessing which of five things broke. Nothing
 * here touches Discord's gateway, so it is safe to run any time.
 */
import { existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, CHANNELS } from "../src/catalog.js";
import { classify } from "../src/parse/classify.js";
import { derive, ORG_TZ, TEAM_TZ, VO_BUFFER_DAYS } from "../src/parse/derive.js";
import { parseAssignment } from "../src/parse/structured.js";

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

let failed = 0;
const ok = (label: string, detail = "") =>
  console.log(`${C.green("✓")}  ${label}${detail ? `  ${C.dim(detail)}` : ""}`);
const bad = (label: string, fix: string) => {
  failed += 1;
  console.log(`${C.red("✗")}  ${label}\n   ${C.yellow("→")} ${fix}`);
};
const warn = (label: string, fix: string) =>
  console.log(`${C.yellow("!")}  ${label}\n   ${C.yellow("→")} ${fix}`);
const note = (label: string, detail = "") =>
  console.log(`${C.dim("·")}  ${label}${detail ? `  ${C.dim(detail)}` : ""}`);

console.log(C.bold("\nSpecular preflight\n"));

// ── 1. Node ───────────────────────────────────────────────────────────────
const major = Number(process.versions.node.split(".")[0]);
if (major >= 22) ok("Node version", `v${process.versions.node}`);
else bad(`Node is v${process.versions.node}, needs v22+`, "Install the LTS from nodejs.org, then run this again.");

// ── 2. .env ───────────────────────────────────────────────────────────────
if (existsSync(".env")) ok(".env file found");
else
  bad(
    "No .env file",
    "Run:  cp .env.example .env   then fill in DISCORD_TOKEN and ANTHROPIC_API_KEY.",
  );

// ── 3. Anthropic key ──────────────────────────────────────────────────────
const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";

if (!anthropicKey) {
  // Not fatal. Templated assignment posts are read by pattern and never touch
  // the API; only messy forwards need the model.
  warn(
    "ANTHROPIC_API_KEY is not set",
    "Assignment posts still parse (by pattern). Forwarded DMs and one-liners will fall back to rules. Key: console.anthropic.com → API Keys.",
  );
} else {
  try {
    // Cheaper and more informative than a message: proves the key works AND
    // that this account can actually reach the model we're configured for.
    const info = await new Anthropic({ apiKey: anthropicKey }).models.retrieve(model);
    ok("Anthropic key works", `model ${info.id} reachable`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/401|authentication|invalid x-api-key/i.test(message)) {
      bad("Anthropic rejected the key", "Check ANTHROPIC_API_KEY in .env — copy it again from console.anthropic.com.");
    } else if (/404|not_found/i.test(message)) {
      bad(`Your account can't reach the model "${model}"`, "Set ANTHROPIC_MODEL in .env to one your account has, e.g. claude-sonnet-5.");
    } else if (/credit|billing|quota/i.test(message)) {
      bad("Anthropic account has no credit", "Add billing at console.anthropic.com → Plans & Billing.");
    } else {
      bad("Could not reach Anthropic", message);
    }
  }
}

// ── 4. Discord token (REST only — no gateway, no intents needed) ──────────
const discordToken = process.env.DISCORD_TOKEN?.trim();

if (!discordToken) {
  bad("DISCORD_TOKEN is not set", "Developer portal → your app → Bot → Reset Token, then put it in .env");
} else {
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${discordToken}` },
    });
    if (res.ok) {
      const me = (await res.json()) as { username?: string; id?: string };
      ok("Discord token works", `bot is ${me.username ?? "?"}`);
      note(
        "This does not prove MESSAGE CONTENT INTENT is on",
        "if the bot goes online but ignores messages, that's the toggle",
      );
    } else if (res.status === 401 || res.status === 403) {
      bad(
        `Discord rejected the token (${res.status})`,
        "Reset Token in the developer portal and copy the new one into .env. If the token is definitely right, a VPN or corporate proxy can also cause a 403.",
      );
    } else if (res.status === 429) {
      bad("Discord is rate-limiting this machine", "Wait a minute and run npm run doctor again.");
    } else {
      bad(`Discord returned ${res.status}`, "Unexpected — paste this output to Claude.");
    }
  } catch (err) {
    bad("Could not reach Discord", err instanceof Error ? err.message : String(err));
  }
}

// ── 5. Settings you'd want to notice ──────────────────────────────────────
const intake = process.env.INTAKE_CHANNEL_IDS?.trim();
note(
  "Listening in",
  intake ? `${intake.split(",").length} named channel(s)` : "every channel it can see (fine for testing)",
);
note("Dates", `${ORG_TZ} / ${TEAM_TZ}, VO = air date − ${VO_BUFFER_DAYS} days`);
note("Catalog", `${CATEGORIES.length} categories, ${CHANNELS.length} channels`);

// ── 6. The pattern parser — no key, no network ───────────────────────────
{
  const post =
    "### 10-03-26 | VIDEO-008 | What If Deadpool Was In Jujutsu Kaisen?\n\n@ Comics\n\n📝 **SCRIPT** <@1>\n* Deadline:\n  * 🇺🇸 **9/19/2026 @ 11:59 PM ET**\n* Word Count: **5000 Words**";
  const hit = parseAssignment(post);
  if (hit?.code === "VIDEO-008" && hit.air_date === "2026-10-03" && hit.word_count === 5000) {
    ok("Assignment posts read by pattern", "no API key needed for these");
  } else {
    bad(
      "The pattern parser did not read a standard assignment post",
      "Paste this output to Claude — src/parse/structured.ts needs a fix.",
    );
  }
}

// ── 7. One real parse through the model, end to end ─────────────────────────────────────────
if (anthropicKey && failed === 0) {
  console.log(C.dim("\nrunning one real message through the parser…"));
  try {
    const result = await classify({
      content: "torch is only at 3 today, need 2 more before 6",
      author: "doctor",
      channelName: "preflight",
    });
    const record = derive(result.extraction, result.raw);

    if (result.parsedBy === "rule") {
      bad("The parser fell back to rules", "The Anthropic call failed at request time — see the error above this line.");
    } else if (record.channel === "Specular Torch") {
      ok("Parser works end to end", `read "torch" as ${record.channel}, category ${record.category}`);
    } else {
      console.log(
        `${C.yellow("!")}  Parser answered, but read the channel as ${C.yellow(String(record.channel))} rather than Specular Torch`,
      );
      console.log(`   ${C.dim("Not fatal — it means the prompt needs tuning. Worth telling Claude.")}`);
    }
  } catch (err) {
    bad("Parser threw", err instanceof Error ? err.message : String(err));
  }
}

// ── verdict ───────────────────────────────────────────────────────────────
console.log();
if (failed === 0) {
  console.log(C.green(C.bold("All clear. Start the bot with:  npm run bot")));
  console.log(C.dim("Then post something in your test channel.\n"));
} else {
  console.log(C.red(C.bold(`${failed} thing${failed === 1 ? "" : "s"} to fix above.`)));
  console.log(C.dim("Fix them and run npm run doctor again. Paste this output to Claude if stuck.\n"));
}
process.exit(failed > 0 ? 1 : 0);
