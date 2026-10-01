/**
 * What a video is about, read from its title, in canonical names so two
 * titles about the same thing match and two about different things don't:
 *
 *   lead     the main character, or the franchise when no one character leads
 *   other    what it's set against: the other franchise, world, opponent or topic
 *   format   what if, power swap, survival, versus, ranking, explainer…
 *   trend    the broader pattern: "Marvel × Anime crossover"
 *
 * "What If Spider-Man Joined The Seven?" and "What If Spider-Man Was In The
 * Boys?" both read Spider-Man / The Boys: the same concept. "What If Batman
 * Was In The Boys?" reads Batman / The Boys: a different one.
 *
 * Claude reads titles fifty at a time (interpretation, kept apart from the
 * numbers); without a key, Story Lab's lore reads what it can (rules).
 */
import { z } from "zod";
import { askClaude, canUseClaude, type Usage } from "../ai/claude.js";
import { readTitle } from "../web/stories/lore.js";
import { formatOfTitle } from "../web/stories/formats.js";
import { titleShape } from "../web/stories/lab.js";
import type { Concept } from "../db/competitors.js";

export const CONCEPT_VERSION = "concepts-1";
export const competitorsModel = () => process.env.COMPETITORS_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";

export const FORMATS = ["what_if", "power", "survival", "versus", "ranking", "explainer", "reborn", "alternate_history", "you", "story", "other"] as const;
export const FORMAT_LABEL: Record<string, string> = {
  what_if: "What if", power: "Power swap", survival: "Survival", versus: "Versus", ranking: "Ranking", explainer: "Explainer",
  reborn: "Reborn", alternate_history: "Alternate history", you: "What if YOU", story: "Story", other: "Other",
};
const FAMILIES = ["Marvel", "DC", "Anime", "Star Wars", "Video games", "Horror", "Cartoons", "TV & film", "Real world", "Other"];

/** A concept's key: lead and other, lowercased, format left out (a crossover told as a what-if or a survival test is one concept). */
export const slug = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/^the\s+/, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const conceptKey = (c: Pick<Concept, "lead" | "other">) => (c.lead ? `${slug(c.lead)}|${slug(c.other)}` : "");
export const conceptLabel = (c: Pick<Concept, "lead" | "other">) => (c.other ? `${c.lead} × ${c.other}` : c.lead ?? "");

// ── rules: Story Lab's lore ─────────────────────────────────────────────────

const LORE_FORMAT: Record<string, (typeof FORMATS)[number]> = {
  insert: "what_if", power: "power", survive: "survival", hunt: "versus", versus: "versus", reborn: "reborn",
  divergence: "alternate_history", you: "you", explainer: "explainer", game: "other",
};

export function ruleConcept(ref: string, title: string): Concept {
  const r = readTitle(title);
  const ranking = /\branked\b|\branking\b|\btop \d+\b|\bevery .+ (ranked|explained)\b|\btier list\b/i.test(title);
  const format = ranking ? "ranking" : LORE_FORMAT[formatOfTitle(title)] ?? "other";
  const lead = r.heroes[0]?.name ?? r.worlds[0]?.name ?? null;
  const other = r.heroes[0] ? r.heroes[1]?.name ?? r.worlds[0]?.name ?? (r.powers[0] ? r.powers[0].from : null) : r.worlds[1]?.name ?? null;
  const franchises = [...new Set([...r.heroes.map((h) => h.from), ...r.worlds.map((w) => w.name), ...r.powers.map((p) => p.from)].map((f) => f.replace(/^the /, "The ")))];
  return {
    ref, title, lead, other, characters: r.heroes.map((h) => h.name), franchises, format,
    trend: franchises.length >= 2 ? `${franchises[0]} × ${franchises[1]} crossover` : franchises[0] ? `${franchises[0]} ${FORMAT_LABEL[format]!.toLowerCase()}` : null,
    shape: titleShape(title), source: "rules",
  };
}

// ── Claude ──────────────────────────────────────────────────────────────────

const Read = z.object({
  videos: z.array(
    z.object({
      id: z.string(),
      lead: z.string().nullable().describe("The main character, canonical name; the franchise when no one character leads; null if neither."),
      other: z.string().nullable().describe("What it's set against: the other franchise/world, the opponent, or the topic (e.g. 'villains'); canonical; null if none."),
      characters: z.array(z.string()),
      franchises: z.array(z.string()),
      format: z.enum(FORMATS),
      trend: z.string().nullable().describe("The broader pattern in a few words, using the family names given."),
    }),
  ),
});

const SYSTEM = `You read YouTube video titles from story and fandom channels (what-if scenarios, power swaps, survival tests, versus battles, rankings, explainers) and say what each video is about, in CANONICAL names, so that titles about the same thing match and titles about different things don't.

For each title:
- lead: the main character (canonical name: "Spider-Man" not "Peter Parker", "Gojo" not "Satoru Gojo", "Homelander"), or the franchise when no single character leads ("FNAF"). Null if neither.
- other: what the video sets the lead against or inside: the other franchise or world ("The Boys" — and "The Seven", "Vought" also mean The Boys; "JJK" means "Jujutsu Kaisen"), the opponent ("Superman"), or the topic of a ranking ("villains", "deaths", "transformations"). Null if there's none.
- characters: every named character, canonical. franchises: every franchise involved, canonical ("Marvel" for Marvel comics and the MCU alike, "DC", "Jujutsu Kaisen", "The Boys", "FNAF").
- format: what_if (a character dropped into another world or joining a team), power (gets another franchise's power or item), survival (could X survive / escape / stop Y), versus (X vs Y, who would win, could X beat Y), ranking (ranked, tier list, every X), explainer (how does X work, why, lore explained), reborn, alternate_history (X never happened, X killed Y), you (what if YOU…), story (a retelling or original story), other.
- trend: the broader pattern, naming families from this list: ${FAMILIES.join(", ")}. E.g. "Marvel × Anime crossover", "Anime power swap", "DC villain rankings", "Horror survival". Same pattern, same words.

Be literal: read only what the title says; never guess what a vague title is about (use null). Use exactly the canonical names in the list of names already in use when one applies.`;

/** Read up to 50 titles. */
export async function readConcepts(items: Array<{ ref: string; title: string }>, knownNames: string[]): Promise<{ concepts: Concept[]; usage: Usage; model: string }> {
  const ids = new Map(items.map((it, i) => [`v${i + 1}`, it]));
  const text = [
    knownNames.length ? `NAMES ALREADY IN USE — use these exact names when they apply:\n${knownNames.slice(0, 200).join(", ")}\n` : "",
    "TITLES:",
    ...[...ids].map(([id, it]) => `${id}: ${it.title}`),
  ].join("\n");
  const { parsed, usage, model } = await askClaude({ model: competitorsModel(), system: SYSTEM, schema: Read, effort: "low", maxTokens: 16000, content: [{ type: "text", text }], what: "read these titles" });
  const concepts: Concept[] = [];
  for (const v of parsed.videos) {
    const it = ids.get(v.id);
    if (!it) continue;
    const clean = (s: string | null) => (s ? s.replace(/\s+/g, " ").trim().slice(0, 80) || null : null);
    concepts.push({
      ref: it.ref, title: it.title, lead: clean(v.lead), other: clean(v.other),
      characters: v.characters.map((c) => c.trim()).filter(Boolean).slice(0, 12), franchises: v.franchises.map((c) => c.trim()).filter(Boolean).slice(0, 12),
      format: v.format, trend: clean(v.trend), shape: titleShape(it.title), source: "ai",
    });
  }
  // A title Claude skipped still gets the rules' reading.
  for (const it of items) if (!concepts.some((c) => c.ref === it.ref)) concepts.push(ruleConcept(it.ref, it.title));
  return { concepts, usage, model };
}

export const canReadWithAi = canUseClaude;
