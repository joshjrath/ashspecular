/**
 * Story Lab: the page, Write next (reroll, save, focus), the dice additions,
 * the draft checker, and Specular's compilations. storyContext() is what the
 * background job reads to write Claude's ideas.
 */
import { CHANNELS } from "../../catalog.js";
import { type ChannelProfile, type FocusKind, type SetFocus, channelProfile, focusBaseline, focusChoices, piecesOfTitle } from "../stories/domain.js";
import type { DiceKind } from "../stories/dice.js";
import { FORMATS, type FormatId } from "../stories/formats.js";
import { HEROES, WORLDS } from "../stories/lore.js";
import { type LabIdea, type LabVideo, type PublicVideo, contrast, indexPublic, keyOfTitle, labIdeas, matchScripts, norm as normTitle, perfStats, publicMatch, shapeStats, writtenIdea } from "../stories/lab.js";
import { SHAPES, SHAPE_BY_ID, applyAdditions, currentAdditions, diceItem, recentAdditions } from "../stories/added.js";
import { type StoryContext, WANT as WRITTEN_WANT, refillSoon } from "../../jobs/storyideas.js";
import { addLabAddition, listIdeaMarks, listLabAdditions, markIdea, removeLabAddition, setShowing, unmarkIdea } from "../../db/lab.js";
import { aiRunSummary, dropAiIdea, dropChannelIdeas, listAiIdeas, listFocus, setFocus } from "../../db/storylab.js";
import { blueprint } from "../stories/blueprint.js";
import { canUseClaude } from "../../ai/claude.js";
import { channelsIn } from "../targets.js";
import { checkDraft } from "../stories/check.js";
import { corpus, learnsFrom, normsFor } from "../stories/corpus.js";
import { dailyCap } from "../stories/brainstorm.js";
import { diceCard, diceLeft, rollDice } from "../stories/roll.js";
import { hasDatabase } from "../../config.js";
import { listScripts } from "../../db/scripts.js";
import { listUploads } from "../../jobs/youtube.js";
import { loadVideoViews } from "../../jobs/breakouts.js";
import { registerSpecular, specularPanel, specularState } from "../specular.js";
import { renderStoryLab } from "../pages/storylab.js";
import { scoreAll } from "../performance.js";
import { scriptFor } from "../scriptindex.js";
import { storiesOnBoard } from "../../db/records.js";
import { writeNext } from "../stories/writenext.js";
import { shell } from "../shell.js";
import type { FastifyInstance } from "fastify";

const DICE_KINDS: DiceKind[] = ["shape", "hero", "world", "power", "target"];

// Story Lab: what to write next for Stories, and how to build it.
type LabQuery = {
  format?: string; hero?: string; world?: string; power?: string; target?: string; shape?: string;
  /** 🎲: any value rolls; `dice` keeps the roll to one group; `added` shows what was just added. */
  roll?: string; dice?: string; added?: string;
  /** Why a script couldn't be added. */
  scripterr?: string;
  /** Unassigned videos: open the list; the title just linked, or why it couldn't be. */
  open?: string; linked?: string; linkerr?: string;
};
/**
 * What Story Lab and Claude's ideas both read: every Stories channel's videos
 * (uploaded and on the board) with how each did, each channel's focus, the
 * marks, and Claude's ideas still in play.
 */
const storyBasics = async () => {
  const channels = channelsIn("stories");
  const now = new Date();
  const [all, views, marks, onBoard, focus, written] = await Promise.all([
    hasDatabase ? listUploads(new Date(0)) : Promise.resolve([]),
    hasDatabase ? loadVideoViews(new Date(0), channels) : Promise.resolve([]),
    hasDatabase ? listIdeaMarks().catch(() => []) : Promise.resolve([]),
    hasDatabase ? storiesOnBoard().catch(() => []) : Promise.resolve([]),
    hasDatabase ? listFocus().catch(() => new Map<string, SetFocus>()) : Promise.resolve(new Map<string, SetFocus>()),
    hasDatabase ? listAiIdeas().catch(() => []) : Promise.resolve([]),
  ]);
  const perf = scoreAll(views, now);
  const stories = all.filter((u) => channels.includes(u.channel));
  const videos: LabVideo[] = stories.map((u) => ({ title: u.title, multiple: perf.get(u.videoId)?.multiple ?? null, publishedAt: u.publishedAt }));
  // Every video already public, on any channel, newest first — Stories ideas never repeat one.
  const published: PublicVideo[] = [...all].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).map((u) => ({ title: u.title, url: u.url, channel: u.channel }));
  const planned: PublicVideo[] = onBoard.filter((r) => !r.uploaded && r.channel).map((r) => ({ title: r.title, url: "", channel: r.channel! }));
  const titlesOf = (channel: string) => [...stories.filter((u) => u.channel === channel).map((u) => u.title), ...onBoard.filter((r) => r.channel === channel).map((r) => r.title)];
  const idOf = (name: string) => CHANNELS.find((c) => c.name === name)?.id ?? name;
  // What's ordinary across the network's Stories videos, so each channel's focus is what sets it apart.
  const baseline = focusBaseline(channels.flatMap(titlesOf));
  const profiles = new Map<string, ChannelProfile>(channels.map((ch) => [ch, channelProfile(ch, titlesOf(ch), focus.get(idOf(ch)) ?? null, baseline)]));
  // Claude's ideas still to use: not rerolled away or saved, not made since (on any channel, or on the board).
  const gone = new Set(marks.filter((m) => m.mark !== "show").map((m) => `${idOf(m.channel)}|${m.key}`));
  const pubIndex = indexPublic(published);
  const live = written.filter((w) => {
    if (gone.has(`${w.channelId}|ai:${w.id}`)) return false;
    const p = piecesOfTitle(w.title);
    const made = publicMatch({ hero: p.hero, world: p.world, power: p.power, target: p.target, title: w.title }, published, pubIndex) ?? publicMatch({ hero: p.hero, world: p.world, power: p.power, target: p.target, title: w.title }, planned);
    if (made) void dropAiIdea(w.id, `made: ${made.title} (${made.channel || "on the board"})`).catch(() => undefined);
    return !made;
  });
  return { channels, now, all, perf, stories, videos, published, planned, marks, onBoard, focus, written, live, titlesOf, idOf, profiles };
};

/** What Claude reads to write a channel's ideas. */
export const storyContext = async (): Promise<StoryContext> => {
  const b = await storyBasics();
  const briefs = b.channels.map((name) => {
    const id = b.idOf(name);
    return {
      id,
      name,
      profile: b.profiles.get(name)!,
      videos: b.stories.filter((u) => u.channel === name).map((u) => ({ title: u.title, multiple: b.perf.get(u.videoId)?.multiple ?? null })),
      planned: b.onBoard.filter((r) => r.channel === name && !r.uploaded).map((r) => r.title),
      // Everything it's been offered before — rerolled, saved, or written already — so nothing comes round again.
      avoid: [...b.marks.filter((m) => m.channel === name).map((m) => m.title), ...b.written.filter((w) => w.channelId === id).map((w) => w.title)],
    };
  });
  const available = new Map<string, number>();
  for (const w of b.live) available.set(w.channelId, (available.get(w.channelId) ?? 0) + 1);
  return { briefs, published: b.published, planned: b.planned, available };
};

const storyLab = async (query: LabQuery, check?: { title: string; text: string }) => {
  const [s, kept, b, runs] = await Promise.all([
    shell("storylab"),
    hasDatabase ? listScripts().catch(() => []) : Promise.resolve([]),
    storyBasics(),
    hasDatabase ? aiRunSummary().catch(() => null) : Promise.resolve(null),
  ]);
  const { channels, now, stories, videos, published, marks, onBoard } = b;
  const scripts = corpus();
  // Claude's ideas, scored from the network's own results like any other.
  const perfNow = perfStats(videos);
  const shapes = shapeStats(videos);
  const multiples = new Map(stories.map((u) => [normTitle(u.title), b.perf.get(u.videoId)?.multiple ?? null] as const));
  const written = new Map<string, LabIdea[]>();
  for (const w of b.live) {
    const name = CHANNELS.find((c) => c.id === w.channelId)?.name;
    if (!name || !channels.includes(name)) continue;
    written.set(name, [...(written.get(name) ?? []), writtenIdea(w, name, perfNow, shapes, multiples)]);
  }
  const heldBack: PublicVideo[] = [];
  // Every idea, best first — just-added dice items brought forward — then two per channel.
  const everything = labIdeas(videos, now, 100_000, published, heldBack, false, recentAdditions());
  const cards = writeNext({
    channels: channels.map((channel) => ({ channel, titles: b.titlesOf(channel), profile: b.profiles.get(channel) })),
    ideas: everything,
    written,
    marks,
    // Too close to anything made or planned, on any channel.
    neighbours: [
      ...onBoard.map((r) => ({ title: r.title, channel: r.channel, source: r.uploaded ? ("uploaded" as const) : ("assigned" as const) })),
      ...published.map((v) => ({ title: v.title, channel: v.channel, source: "uploaded" as const })),
      ...scripts.map((x) => ({ title: x.title, channel: null, source: "script" as const })),
    ],
  });
  // Remember what's showing, so the next visit (and a reroll elsewhere) leaves these cards where they are.
  if (hasDatabase) {
    for (const channel of channels) {
      const shown = (cards.get(channel) ?? []).map((c) => c.idea.key).sort().join("\n");
      const was = marks.filter((m) => m.channel === channel && m.mark === "show").map((m) => m.key).sort().join("\n");
      if (shown === was) continue;
      await setShowing(
        channel,
        (cards.get(channel) ?? []).map((c) => ({
          key: c.idea.key, title: c.idea.title, format: c.idea.format, hero: c.idea.hero?.id ?? null, world: c.idea.world?.id ?? null,
          power: c.idea.power?.id ?? null, target: c.idea.target?.id ?? null, shape: c.idea.shape ?? null, score: c.score,
        })),
      ).catch((err) => console.error("[lab] couldn't keep the cards:", err));
    }
  }
  // One of Claude's ideas has a blueprint only when its title is a format the lore builds, with its lead — under its own title.
  const printOf = (idea: LabIdea) => {
    if (idea.ai && !(piecesOfTitle(idea.title).format && idea.hero)) return null;
    const bp = blueprint({ format: idea.format, hero: idea.hero?.id, world: idea.world?.id, power: idea.power?.id, target: idea.target?.id, shape: idea.shape });
    return bp && idea.ai ? { ...bp, title: idea.title, alternates: [] } : bp;
  };
  const byId = new Map(b.written.map((w) => [`ai:${w.id}`, w]));
  const writeNextData = channels.map((channel) => {
    const id = b.idOf(channel);
    return {
      channel,
      id,
      cards: (cards.get(channel) ?? []).map((c) => ({ ...c, blueprint: printOf(c.idea) })),
      saved: marks.filter((m) => m.channel === channel && m.mark === "save").map((m) => ({ ...m, written: byId.get(m.key) ?? null })),
      skipped: marks.filter((m) => m.channel === channel && m.mark === "skip").length,
      profile: b.profiles.get(channel)!,
      set: b.focus.get(id) ?? null,
      writtenLeft: b.live.filter((w) => w.channelId === id).length,
      lastRun: runs?.last.get(id) ?? null,
    };
  });
  const ideas = writeNextData.flatMap((w) => w.cards.map((c) => ({ idea: c.idea, blueprint: c.blueprint })));
  // A title shape picked in the builder ("shape:hundreddays") builds on its own format.
  const shape = query.shape && SHAPE_BY_ID.has(query.shape) ? SHAPE_BY_ID.get(query.shape)! : null;
  const picked = {
    format: shape ? shape.base : FORMATS.some((f) => f.id === query.format) ? query.format! : "insert",
    shape: shape?.id ?? "",
    hero: query.hero ?? "",
    world: query.world ?? "",
    power: query.power ?? "",
    target: query.target ?? "",
  };
  const built = query.hero || query.world || query.power
    ? blueprint({ format: picked.format as FormatId, hero: picked.hero || null, world: picked.world || null, power: picked.power || null, target: picked.target || null, shape: picked.shape || null })
    : null;

  // 🎲 — one new item, or the one just added and what it opens up.
  const group = DICE_KINDS.includes(query.dice as DiceKind) ? (query.dice as DiceKind) : null;
  const rolledOne = query.roll !== undefined ? rollDice(group) : null;
  const [addedKind, addedId] = (query.added ?? "").split(":");
  const dice = {
    rolled: rolledOne ? diceCard(rolledOne.kind, rolledOne.id, videos, published) : null,
    added: addedKind && addedId && DICE_KINDS.includes(addedKind as DiceKind) ? diceCard(addedKind as DiceKind, addedId, videos, published) : null,
    additions: currentAdditions().map((a) => ({ ...a, name: diceItem(a.kind, a.id)?.name ?? a.id })),
    left: diceLeft(),
    group,
    nonce: String(Date.now()),
    rolledNothing: query.roll !== undefined && !rolledOne,
  };
  const builtRepeats = built ? publicMatch({ hero: built.hero, world: built.world, power: built.power, target: built.target, title: built.title }, published) : null;
  const results = matchScripts(videos);
  // Coverage: heroes who lead a script or a top idea, against every world.
  const done = new Set<string>();
  for (const t of [...scripts.map((x) => x.title), ...stories.map((u) => u.title)]) for (const p of keyOfTitle(t).pairs) done.add(p);
  const leadIds = new Set([...scripts.map((x) => x.heroes[0]?.id), ...ideas.map((i) => i.idea.hero?.id)].filter(Boolean) as string[]);
  return renderStoryLab(s, {
    specular: hasDatabase ? await specularState().then(specularPanel).catch((err) => (console.error("[specular] panel failed:", err), "")) : "",
    scripts: scripts.length,
    words: scripts.reduce((n, x) => n + x.words, 0),
    matched: results.length,
    ideas,
    blueprint: built,
    builtRepeats,
    heldBack: heldBack.length,
    publicCount: published.length,
    picked,
    check: check ? { ...check, result: checkDraft(check.text, check.title) } : null,
    contrast: contrast(results),
    results,
    coverage: { heroes: HEROES.filter((h) => leadIds.has(h.id)), worlds: WORLDS, done },
    formats: FORMATS.map((f) => {
      const mine = scripts.filter((x) => x.format === f.id);
      return { format: f, norms: normsFor(mine.length ? mine : scripts), examples: mine.map((x) => x.title) };
    }).filter((f) => f.examples.length),
    shapes: [...SHAPES],
    dice,
    writeNext: writeNextData,
    claude: { on: canUseClaude(), today: runs?.calls ?? 0, cap: dailyCap(), kept: runs?.kept ?? 0, want: WRITTEN_WANT },
    focusChoices: focusChoices(),
    // Every Stories upload with no script anywhere — attached, in Story Lab or delivered on the Scripts tab.
    unassigned: {
      videos: stories
        .filter((u) => !scriptFor({ title: u.title }))
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .map((u) => ({ title: u.title, channel: u.channel, url: u.url, publishedAt: u.publishedAt, views: u.views })),
      total: stories.length,
      open: query.open === "unassigned",
      linked: (query.linked ?? "").slice(0, 200),
      error: (query.linkerr ?? "").slice(0, 200),
    },
    library: {
      // Stories videos' scripts and those added on their own — the ones Story Lab reads.
      scripts: kept.filter(learnsFrom),
      drive: scripts.filter((x) => !x.board).length,
      error: (query.scripterr ?? "").slice(0, 200),
    },
  });
};

export function registerStoryLab(app: FastifyInstance): void {
  app.get<{ Querystring: LabQuery }>("/story-lab", async (request, reply) =>
    reply.type("text/html").send(await storyLab(request.query)),
  );
  // Specular compilations: the next Movie and Sleep, their pages, the catalog.
  if (hasDatabase) registerSpecular(app, shell, () => storyLab({}));
  // 🎲 Add what was rolled, or take an addition out again.
  app.post<{ Body: { kind?: string; id?: string } }>("/story-lab/add", async (request, reply) => {
    const kind = request.body?.kind as DiceKind;
    const id = request.body?.id ?? "";
    if (!hasDatabase || !DICE_KINDS.includes(kind) || !diceItem(kind, id)) return reply.redirect("/story-lab#dice");
    await addLabAddition(kind, id);
    applyAdditions(await listLabAdditions());
    return reply.redirect(`/story-lab?added=${kind}:${encodeURIComponent(id)}#dice`);
  });
  app.post<{ Body: { kind?: string; id?: string } }>("/story-lab/remove", async (request, reply) => {
    const kind = request.body?.kind as DiceKind;
    if (hasDatabase && DICE_KINDS.includes(kind)) {
      await removeLabAddition(kind, request.body?.id ?? "");
      applyAdditions(await listLabAdditions());
    }
    return reply.redirect("/story-lab#dice");
  });

  // Write next: ↻ a fresh idea in a card's place, 🔖 save it to the channel's bucket, or take it out again.
  app.post<{ Body: Record<string, string | undefined> }>("/story-lab/idea", async (request, reply) => {
    const b = request.body ?? {};
    const channel = channelsIn("stories").find((c) => c === b.channel);
    const key = (b.key ?? "").slice(0, 300);
    const anchor = `#wn-${CHANNELS.find((c) => c.name === channel)?.id ?? ""}`;
    if (!hasDatabase || !channel || !key) return reply.redirect(`/story-lab${anchor}`);
    // One of Claude's ideas used up: that channel's pool is topped up in the background.
    if (key.startsWith("ai:") && (b.do === "reroll" || b.do === "save")) refillSoon(CHANNELS.find((c) => c.name === channel)?.id ?? "");
    if (b.do === "unsave") await unmarkIdea(channel, key);
    else if (b.do === "reroll" || b.do === "save") {
      const opt = (v: string | undefined) => (v ? v.slice(0, 100) : null);
      await markIdea({
        channel, key, mark: b.do === "save" ? "save" : "skip", title: (b.title ?? "").slice(0, 300), format: (b.format ?? "").slice(0, 40),
        hero: opt(b.hero), world: opt(b.world), power: opt(b.power), target: opt(b.target), shape: opt(b.shape),
        score: Math.max(0, Math.min(100, Number(b.score) || 0)),
      });
    }
    return reply.redirect(`/story-lab${anchor}`);
  });

  // A channel's focus — what its videos are about — set by hand, or back to reading it from its videos; and its note for Claude.
  app.post<{ Body: Record<string, string | undefined> }>("/story-lab/focus", async (request, reply) => {
    const b = request.body ?? {};
    const channel = channelsIn("stories").find((c) => c === b.channel);
    const id = CHANNELS.find((c) => c.name === channel)?.id ?? "";
    if (hasDatabase && channel) {
      const raw = (b.focus ?? "").trim();
      const [kind, ...rest] = raw.split(":");
      const kinds: Array<FocusKind | "any"> = ["lead", "hero", "franchise", "format", "genre", "any"];
      const focus = raw === "any" ? { kind: "any" as const, value: null } : kinds.includes(kind as FocusKind) && rest.join(":") ? { kind: kind as FocusKind, value: rest.join(":") } : null;
      const before = (await listFocus().catch(() => new Map<string, SetFocus>())).get(id);
      await setFocus(id, focus, b.note ?? null);
      // A new focus or note: what Claude wrote to the old one is set aside, and it writes to the new one.
      if ((before?.kind ?? null) !== (focus?.kind ?? null) || (before?.value ?? null) !== (focus?.value ?? null) || (before?.note ?? "") !== (b.note ?? "").replace(/\s+/g, " ").trim()) {
        await dropChannelIdeas(id, "the channel's focus changed");
        refillSoon(id);
      }
    }
    return reply.redirect(`/story-lab#wn-${id}`);
  });

  // Drafts are posted: they're far too long for a link.
  app.post<{ Body: Record<string, string | undefined> }>("/story-lab/check", async (request, reply) => {
    const b = request.body ?? {};
    return reply.type("text/html").send(
      await storyLab({}, { title: (b.title ?? "").trim().slice(0, 200), text: (b.script ?? "").slice(0, 120_000) }),
    );
  });
}
