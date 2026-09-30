/**
 * Claude reads the sources, in two passes, and always answers in structured
 * JSON (never prose the board has to pick apart):
 *
 *   quick look   posts in batches of up to 20, text (and a picture for posts
 *                that are mostly picture): is there anything here a Short
 *                could be built on, for which channel, about whom.
 *   full         one post at a time, with its pictures and the network's
 *                closest existing Bits and ideas: the irreplaceable detail,
 *                a suggested Bit built on it, classification and canon
 *                confidence, eight part-scores, and which history items it
 *                repeats and why.
 *
 * The AI never produces the Idea Score itself or any performance number: it
 * rates parts, and the score is worked out from them in code (score.ts).
 * The model is ideasModel() (IDEAS_MODEL or ANTHROPIC_MODEL overrides the
 * default), low effort for the quick look, medium for the full read. Refusal
 * fallback is on where the model supports it: if the model declines a post,
 * another model answers in the same call.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeError as AnalysisError, askClaude, canUseClaude, type Usage } from "../ai/claude.js";
import { z } from "zod";
import { CLASSIFICATION_IDS, COMEDY_ENGINES } from "./types.js";
import type { HistoryItem } from "./similar.js";

export const ideasModel = () => process.env.IDEAS_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
export const canAnalyze = canUseClaude;

export type { Usage };
/** Why an analysis failed, and whether trying again later could help. */
export { AnalysisError };

export interface ChannelHint { channel: string; tags: string[] }
const channelList = (channels: ChannelHint[]) =>
  channels.map((c) => `- ${c.channel}${c.tags.length ? ` — watches: ${c.tags.join(", ")}` : ""}`).join("\n");

// ── the quick look ─────────────────────────────────────────────────────────

const TRIAGE_SYSTEM = `You screen Tumblr posts for Specular Bits, a network of YouTube Shorts channels that turn fandom observations into short illustrated comedy and story videos. Each request is a batch of posts pulled from fandom tags. For each post, judge quickly whether it holds material a Short could be built on: a specific observation, joke, scenario, lore implication, character dynamic, misunderstanding, power interaction or visual gag about a franchise's characters.

Most posts in a fandom tag are not source material — fanart with no idea attached, shipping edits, merch, news, personal posts, reposted memes with no specific angle. Give those low potential and say why in a few words. Popularity and polish don't count here; the specific idea does.

potential, 0 to 1:
- 0.8–1: a specific, franchise-grounded observation or scenario that clearly could carry a Short.
- 0.5–0.8: usable with work — a good angle stated loosely, or a solid premise that needs shaping.
- 0.2–0.5: faint — a generic joke, a vague headcanon, would need heavy invention.
- 0–0.2: nothing to build on.

channels: the best-fitting channel names from the list you're given, exactly as written; empty if none fits.
franchises and characters: canonical names as the franchise uses them, e.g. "Spider-Man (Peter Parker)".
hook: the specific thing a Short could be built around, in one line — or "" if there isn't one.
spam: true only for ads, bots, giveaways or unrelated promotion.
Return one entry per post, using each post's id exactly.`;

const TriageSchema = z.object({
  posts: z.array(
    z.object({
      id: z.string(),
      potential: z.number(),
      kind: z.enum(["observation", "joke", "scenario", "headcanon", "theory", "meta", "art_only", "shipping", "news", "personal", "promo", "other"]),
      spam: z.boolean(),
      franchises: z.array(z.string()),
      characters: z.array(z.string()),
      channels: z.array(z.string()),
      hook: z.string(),
      reason: z.string(),
    }),
  ),
});
export type TriageItem = z.infer<typeof TriageSchema>["posts"][number];

export interface TriagePost {
  id: string;
  body: string;
  tags: string[];
  notes: number | null;
  postType: string;
  image: string | null;
}

// ── the full read ──────────────────────────────────────────────────────────

const FULL_SYSTEM = `You develop source material for Specular Bits, a network of YouTube Shorts channels. Each Short is a short illustrated comedy or story video about a franchise's characters, built from a specific fandom observation. You're given one source post (usually from Tumblr), the channels it could suit, and a list of the network's existing Bits and ideas that might be similar. A person makes every final decision; your job is to show them clearly what the source offers and what's wrong with it.

What to find in the source:
- The irreplaceable detail: the specific, weird observation that makes this post interesting. Not a summary. Bad: "This is a post about Ben 10 aliens." Good: "The Omnitrix picks the alien by what Ben needs, so it has been quietly judging his plans for years."
- Whether it can become a Short: a scenario, joke, character interaction, lore implication, misunderstanding, power interaction, relationship dynamic, visual gag, dramatic irony, role reversal, a supernatural ability used for something mundane, an unusual canon observation.
- Franchise specificity: an idea that breaks if you swap the characters for another franchise's is worth far more. "Character goes to McDonald's" is generic; "the character's established power creates a ridiculous problem at McDonald's" is specific.
- Visual potential: these are illustrated Shorts. Expressive reactions, funny compositions, escalating visuals, props, transformations, environmental jokes and visual punchlines work; a concept that only works as a paragraph of explanation does not.
- Context burden: how long a viewer needs before the joke lands. Twenty seconds of explaining an obscure fan AU is a real cost, however interesting the source.

Editorial rules:
1. Specific beats generic.
2. Preserve the source's irreplaceable detail.
3. Don't turn a fandom post into a generic sitcom scenario.
4. A different character doesn't make an old premise new.
5. A different franchise doesn't make an old comedy mechanism new.
6. Canon accuracy matters.
7. Intentional AU, headcanon or fan theory is fine, as long as it's classified as such.
8. Don't confuse intentional non-canon storytelling with accidental misinformation.
9. Ideas should be understandable quickly.
10. Visual comedy matters.
11. Don't lean on fourth-wall, fandom or meta concepts.
12. Ideas in one batch should differ in comedy engine and structure.
13. Recurring characters are fine; recurring premises are not.
14. Anything too close to something recently published is a serious problem.
15. When unsure about canon, flag it for verification rather than inventing an answer.

The suggested Bit: build an original Short around the specific thing that made the post interesting — source-specific detail, then a new premise, then franchise-specific escalation. The detail must survive; the aim is not to get as far from the post as possible. Title in the channel's style (short, punchy, title case). Premise in one to three sentences. Direction in one or two sentences of writing or production guidance. If there's nothing viable, set viable to false, leave the suggestion empty and score low.

Classification — what the idea is, as a Short would present it:
CANON (true in the source material), CANON_INSPIRED (extrapolated from canon without contradicting it), FAN_THEORY (a proposed explanation of canon), HEADCANON (a fan's personal interpretation), AU (an alternate universe or premise), WHAT_IF (a hypothetical change to canon), CROSSOVER (characters from more than one franchise), META (about the fandom, the medium or the fourth wall).
classification_confidence: how sure you are the label is right.
canon_confidence: how sure you are that the canon facts the premise relies on are accurate — separate from the label. A fan theory built on correct canon facts can have high canon confidence; a "canon" claim you half-remember must not.
canon_verification_required: true whenever the premise depends on a lore claim you aren't sure of; list each claim to check in canon_checks. Your confidence is an estimate, never a verification — don't state an uncertain fact as certain.

scores, each 0 to 1, judged on the source and your suggested Bit (the Idea Score is worked out from these separately; don't inflate them):
originality (fresh vs familiar), franchise_specificity, visual_potential, comedy_potential (scenario or joke strength), character_recognition (how well the channel's audience knows these characters), context_efficiency (1 = understood instantly), audience_fit (right for the recommended channel), source_specificity (how concrete the source's detail is).
0.9+ is rare and exceptional; 0.5 is ordinary.

History: compare the idea with each listed entry by premise and comedy mechanism — characters, relationship, situation, comedy engine, payoff — never by title words. The same mechanism with renamed characters counts as similar; the same characters in a different premise doesn't. List only entries at least 0.3 similar, by their id exactly as given. 0.9+ is the same premise; 0.6–0.9 the same mechanism with different specifics; 0.3–0.6 related. same_mechanism is true when the comedy engine and payoff are the same. If nothing is listed, return an empty list.

fingerprint: describe your suggested Bit as characters, relationship, situation, comedy engine and payoff, a few words each.
why_it_works and warnings: short, specific phrases (up to four each), about this source — not generic praise.
Write plainly and specifically. No hype.`;

const Unit = z.number();
const FullSchema = z.object({
  viable: z.boolean(),
  headline: z.string(),
  irreplaceable_detail: z.string(),
  franchises: z.array(z.string()),
  characters: z.array(z.string()),
  recommended_channels: z.array(z.object({ channel: z.string(), confidence: Unit })),
  classification: z.enum(CLASSIFICATION_IDS),
  classification_confidence: Unit,
  canon_confidence: Unit,
  canon_verification_required: z.boolean(),
  canon_checks: z.array(z.string()),
  suggested_title: z.string(),
  suggested_premise: z.string(),
  suggested_direction: z.string(),
  comedy_engines: z.array(z.enum(COMEDY_ENGINES)),
  scores: z.object({
    originality: Unit,
    franchise_specificity: Unit,
    visual_potential: Unit,
    comedy_potential: Unit,
    character_recognition: Unit,
    context_efficiency: Unit,
    audience_fit: Unit,
    source_specificity: Unit,
  }),
  fingerprint: z.object({ characters: z.string(), relationship: z.string(), situation: z.string(), comedy_engine: z.string(), payoff: z.string() }),
  why_it_works: z.array(z.string()),
  warnings: z.array(z.string()),
  similar: z.array(z.object({ ref: z.string(), similarity: Unit, same_mechanism: z.boolean(), reason: z.string() })),
});
export type FullResult = z.infer<typeof FullSchema>;

export interface FullPost {
  provider: string;
  author: string | null;
  postedAt: Date | null;
  foundAt: Date;
  notes: number | null;
  tags: string[];
  postType: string;
  isReblog: boolean;
  body: string;
  images: string[];
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n[… cut here: the post runs on]` : s);
const day = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
const ago = (from: Date | null, to: Date) => {
  if (!from) return "";
  const h = Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);
  return h < 48 ? `${Math.round(h)} hours before it was found` : `${Math.round(h / 24)} days before it was found`;
};

function historyList(history: Array<HistoryItem & { id: string }>): string {
  if (!history.length) return "HISTORY: nothing close on record.";
  const kind = (h: HistoryItem) => (h.kind === "bit" ? "published Bit" : h.kind === "idea" ? (h.date ? "approved idea" : "approved idea, not made yet") : "rejected idea");
  const date = (d: string | null) => (d ? ` · ${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(0, 4)}` : "");
  return `HISTORY — the network's existing Bits and ideas that might be similar:\n${history
    .map((h) => `${h.id} · ${kind(h)} · ${h.channel ?? "unknown channel"}${date(h.date)} · “${h.title}”${h.premise ? ` — ${clip(h.premise, 300)}` : ""}`)
    .join("\n")}`;
}

// ── calling Claude ─────────────────────────────────────────────────────────

function ask<T>(opts: {
  system: string;
  schema: z.ZodType<T>;
  effort: "low" | "medium";
  maxTokens: number;
  content: Anthropic.Beta.BetaContentBlockParam[];
}): Promise<{ parsed: T; model: string; usage: Usage }> {
  return askClaude({ ...opts, model: ideasModel(), what: "analyse this post" });
}

/** The quick look at a batch of posts. */
export async function triageBatch(posts: TriagePost[], channels: ChannelHint[]): Promise<{ items: Map<string, TriageItem>; model: string; usage: Usage }> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const text: string[] = [`CHANNELS:\n${channelList(channels)}`, "", "POSTS — one entry for each id:"];
  for (const p of posts) {
    // A post that's mostly picture is shown its first picture; the rest are read as text.
    if (p.image) {
      content.push({ type: "text", text: `Picture for post ${p.id}:` });
      content.push({ type: "image", source: { type: "url", url: p.image } });
    }
    text.push(
      `<post id="${p.id}" type="${p.postType}" notes="${p.notes ?? "unknown"}" tags="${p.tags.slice(0, 15).join(", ").replace(/"/g, "'")}">\n${clip(p.body || "(no text)", 1500)}\n</post>`,
    );
  }
  content.push({ type: "text", text: text.join("\n") });
  const run = (blocks: Anthropic.Beta.BetaContentBlockParam[]) => ask({ system: TRIAGE_SYSTEM, schema: TriageSchema, effort: "low", maxTokens: 12000, content: blocks });
  let answer;
  try {
    answer = await run(content);
  } catch (err) {
    // One picture that can't be fetched fails the batch: read them all as words instead.
    const withImages = content.some((b) => b.type === "image");
    if (!withImages || !(err instanceof AnalysisError) || err.retryable) throw err;
    answer = await run(content.filter((b) => b.type !== "image" && !(b.type === "text" && b.text.startsWith("Picture for post "))));
  }
  return { items: new Map(answer.parsed.posts.map((p) => [p.id, p])), model: answer.model, usage: answer.usage };
}

/**
 * The full read of one post. History items are given ids (H1, H2, …) and the
 * answer's `similar` refers back to them. A post whose pictures can't be
 * fetched is read again from its words alone.
 */
export async function analyzeFull(
  post: FullPost,
  channels: ChannelHint[],
  history: HistoryItem[],
): Promise<{ result: FullResult; model: string; usage: Usage; history: Array<HistoryItem & { id: string }>; imagesRead: boolean }> {
  const listed = history.map((h, i) => ({ ...h, id: `H${i + 1}` }));
  const header = (shown: number) => [
    `CHANNELS (recommend the best fit, with confidence):\n${channelList(channels)}`,
    "",
    "POST",
    `Source: ${post.provider === "tumblr" ? "Tumblr" : post.provider}${post.author ? ` · @${post.author}` : ""}${post.postedAt ? ` · posted ${day(post.postedAt)} (${ago(post.postedAt, post.foundAt)})` : ""}${post.notes !== null ? ` · ${post.notes} notes` : ""}`,
    post.tags.length ? `Tags: ${post.tags.slice(0, 25).map((t) => `#${t}`).join(" ")}` : "Tags: none",
    `Type: ${post.postType}${post.isReblog ? " (a reblog chain: each paragraph is one blog, oldest first)" : ""}`,
    "---",
    clip(post.body || "(no text — the pictures are the post)", 12000),
    "---",
    shown
      ? `${shown} picture${shown === 1 ? "" : "s"} from the post ${shown === 1 ? "is" : "are"} attached above, in order.`
      : post.images.length
        ? `The post has ${post.images.length} picture${post.images.length === 1 ? "" : "s"} that couldn't be loaded — judge from the words, and say so if the pictures probably carry the idea.`
        : "No pictures.",
    "",
    historyList(listed),
  ].join("\n");
  const run = (images: string[]) =>
    ask({
      system: FULL_SYSTEM,
      schema: FullSchema,
      effort: "medium",
      maxTokens: 16000,
      content: [...images.map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })), { type: "text", text: header(images.length) }],
    });
  const images = post.images.slice(0, 4);
  try {
    const r = await run(images);
    return { result: r.parsed, model: r.model, usage: r.usage, history: listed, imagesRead: true };
  } catch (err) {
    // A picture Claude couldn't fetch fails the whole request: read the words alone.
    if (images.length && err instanceof AnalysisError && !err.retryable) {
      const r = await run([]);
      return { result: r.parsed, model: r.model, usage: r.usage, history: listed, imagesRead: false };
    }
    throw err;
  }
}
