/**
 * Ideas Claude writes for one Stories channel, from that channel's own
 * videos — not limited to the lore's heroes, worlds and formats.
 *
 * Claude gets what the channel is about (its focus and any note), every one
 * of its videos with how each did against the channel's usual, what's
 * planned, and what's been turned down; it writes new ideas in the channel's
 * own title style, built on what works there. Every idea is then checked in
 * code before it's kept: nothing that repeats a video on any channel (the
 * same character with the same world, power or opponent is the same video),
 * nothing on the board already, nothing that visibly misses the channel's
 * focus. The score comes later, from the network's own results
 * (lab.ts writtenIdea), never from Claude.
 */
import { z } from "zod";
import { askClaude, type Usage } from "../../ai/claude.js";
import { publicMatch, norm, type PublicVideo } from "./lab.js";
import { fitsChannel, focusSource, piecesOfTitle, type ChannelProfile } from "./domain.js";

export const storyModel = () => process.env.STORYLAB_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";

/** The most calls a day, all channels together (STORYLAB_AI_DAILY). */
export const dailyCap = () => Math.max(0, Math.round(Number(process.env.STORYLAB_AI_DAILY) || 30));

const Written = z.object({
  ideas: z.array(
    z.object({
      title: z.string().describe("The video's title, in this channel's own title style."),
      premise: z.string().describe("One or two sentences: the hook, and what makes it a story."),
      beats: z.array(z.string()).describe("Four to six short beats: how the video goes, in order."),
      why: z.string().describe("One sentence: why it suits this channel, citing its own videos' results."),
      modelled_on: z.array(z.string()).describe("Titles of this channel's own videos it builds on, exactly as listed."),
    }),
  ),
});

export interface ChannelBrief {
  id: string;
  name: string;
  profile: ChannelProfile;
  /** Its videos, uploaded and on the board, with how each did (× its usual; null when too new to say). */
  videos: Array<{ title: string; multiple: number | null }>;
  /** On the board, not uploaded yet. */
  planned: string[];
  /** Ideas turned down, saved, or already suggested for it: not again. */
  avoid: string[];
}

function focusLine(p: ChannelProfile): string {
  if (p.open) return "anything (set by hand)";
  if (!p.focus.length) return "no single focus — judge from its videos";
  return p.focus.map((f) => `${f.label} (${focusSource(f)})`).join(" + ");
}

/** The system prompt: what the job is, the rules, and every Stories channel so Claude knows what belongs where. */
export function storySystem(network: ChannelBrief[]): string {
  return `You develop video ideas for Specular's long-form Stories channels on YouTube. A Stories video is a narrated story of about 4,750 words (8–10 parts) built on a premise about fictional characters: a character dropped into another franchise's world, handed another franchise's power, put through a survival test, set against an opponent, reborn with their memories, an alternate history, a second-person "What If YOU…", an explainer, a versus breakdown, a ranking — whatever a channel's own videos do.

Each request is for ONE channel. You get its focus (what its videos are about), a note from the studio if there is one, its videos with how each did against the channel's usual (1.0× is its usual; higher did better), what's planned, and ideas already turned down or suggested. Write new ideas for that channel.

Rules:
1. Every idea must clearly belong on this channel: the franchises and kinds of characters its videos cover, and the formats it uses. Never write an idea that belongs on a different channel — an Invincible or Green Lantern idea is not an anime video; a survival channel's ideas are survival tests.
2. The title is in the channel's own title style (read its titles) and under 80 characters.
3. Build on what works here: lean toward the characters, worlds, formats and title shapes of its best-performing videos and away from what did badly — without copying any of them. List the channel's videos each idea builds on in modelled_on, exactly as titled.
4. Never repeat a video — the channel's, the network's, or one planned — in any wording. The same character with the same world, power or opponent is the same video.
5. You are not limited to any list. Any character, franchise, world, power or format this channel's audience would recognise is fair: new crossovers, new matchups, new title shapes.
6. Respect canon: get each character's powers, limits and personality right. The premise has to make sense, and the story's escalation has to come from who the character really is.
7. The ideas differ from each other: different leads or different worlds, not variations on one.
8. premise: one or two sentences. beats: four to six short beats, in order. why: one sentence, citing this channel's own results.

THE NETWORK'S STORIES CHANNELS — so you know what belongs where:
${network.map((c) => `- ${c.name}: ${focusLine(c.profile)}${c.profile.note ? ` — the studio says: ${c.profile.note}` : ""}`).join("\n")}`;
}

const fmt = (m: number | null) => (m === null ? "new" : `${m.toFixed(1)}×`);

/** The request for one channel: its focus, note, videos (best first), planned and turned-down ideas. */
export function storyRequest(c: ChannelBrief, count: number, elsewhere: string[]): string {
  const judged = c.videos.filter((v) => v.multiple !== null).sort((a, b) => b.multiple! - a.multiple!);
  const fresh = c.videos.filter((v) => v.multiple === null);
  const lines = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (none)");
  return [
    `CHANNEL: ${c.name}`,
    `FOCUS: ${focusLine(c.profile)}`,
    c.profile.note ? `THE STUDIO'S NOTE: ${c.profile.note}` : "",
    "",
    `ITS VIDEOS — ${judged.length} with results, best first:`,
    lines(judged.slice(0, 220).map((v) => `${fmt(v.multiple)} ${v.title}`)),
    fresh.length ? `\nTOO NEW TO JUDGE:\n${lines(fresh.slice(0, 60).map((v) => v.title))}` : "",
    "",
    "PLANNED — on the board, not out yet:",
    lines(c.planned.slice(0, 80)),
    "",
    "TURNED DOWN OR ALREADY SUGGESTED — don't repeat:",
    lines(c.avoid.slice(0, 120)),
    "",
    "RECENT ON THE NETWORK'S OTHER CHANNELS — don't repeat these either:",
    lines(elsewhere.slice(0, 80)),
    "",
    `Write ${count} new ideas for ${c.name}.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export interface KeptIdea {
  title: string;
  premise: string;
  beats: string[];
  why: string;
  modelledOn: string[];
}

/**
 * Keep only what's new and belongs: not public anywhere, not on the board,
 * not already suggested, not twice in one batch, and — when the title can be
 * read — within the channel's focus. Says why each dropped one went.
 */
export function vetIdeas(
  ideas: z.infer<typeof Written>["ideas"],
  c: ChannelBrief,
  published: PublicVideo[],
  planned: PublicVideo[],
): { kept: KeptIdea[]; dropped: Array<{ title: string; why: string }> } {
  const kept: KeptIdea[] = [];
  const dropped: Array<{ title: string; why: string }> = [];
  const seen = new Set(c.avoid.map(norm));
  const own = new Set(c.videos.map((v) => norm(v.title)));
  for (const i of ideas) {
    const title = i.title.replace(/\s+/g, " ").trim().slice(0, 140);
    if (title.length < 8) continue;
    const key = norm(title);
    if (seen.has(key) || own.has(key)) {
      dropped.push({ title, why: "already suggested or made" });
      continue;
    }
    const p = piecesOfTitle(title);
    const repeats = publicMatch({ hero: p.hero, world: p.world, power: p.power, target: p.target, title }, published) ?? publicMatch({ hero: p.hero, world: p.world, power: p.power, target: p.target, title }, planned);
    if (repeats) {
      dropped.push({ title, why: `repeats “${repeats.title}” (${repeats.channel})` });
      continue;
    }
    // Only a title the lore can read can be checked; the rest Claude wrote to the focus it was given.
    if ((p.hero || p.world || p.power) && c.profile.focus.length && !fitsChannel(c.profile, p).ok) {
      dropped.push({ title, why: `doesn't fit ${c.name}: ${fitsChannel(c.profile, p).why}` });
      continue;
    }
    seen.add(key);
    kept.push({
      title,
      premise: i.premise.trim().slice(0, 800),
      beats: i.beats.map((b) => b.trim()).filter(Boolean).slice(0, 8).map((b) => b.slice(0, 300)),
      why: i.why.trim().slice(0, 400),
      modelledOn: i.modelled_on.filter((t) => own.has(norm(t))).slice(0, 5),
    });
  }
  return { kept, dropped };
}

/** Ask Claude for a channel's ideas. */
export async function writeIdeasFor(
  c: ChannelBrief,
  network: ChannelBrief[],
  elsewhere: string[],
  count = 6,
): Promise<{ ideas: z.infer<typeof Written>["ideas"]; model: string; usage: Usage }> {
  const { parsed, model, usage } = await askClaude({
    model: storyModel(),
    system: storySystem(network),
    schema: Written,
    effort: "medium",
    maxTokens: 16000,
    content: [{ type: "text", text: storyRequest(c, count, elsewhere) }],
    what: "write ideas for this channel",
  });
  return { ideas: parsed.ideas, model, usage };
}
