/**
 * Rolling Story Lab's dice: one new item from one group — a format (title
 * shape), a hero, a world or setting, a power, or a target — never one that's
 * already in. Each roll says what the item is and which ideas it opens up.
 */
import { diceItem, inLab, withItem } from "./added.js";
import { DICE_LABELS, diceGroups, type DiceKind, type Shape } from "./dice.js";
import { FORMAT_BY_ID } from "./formats.js";
import { labIdeas, type LabIdea, type LabVideo, type PublicVideo } from "./lab.js";
import { voice, type Hero, type Power, type World } from "./lore.js";

export interface DiceCard {
  kind: DiceKind;
  group: string;
  id: string;
  name: string;
  from: string;
  facts: Array<[string, string]>;
  /** The best ideas it would make, each with its blueprint link. */
  opens: Array<{ title: string; format: string; href: string }>;
}

const KINDS: DiceKind[] = ["shape", "hero", "world", "power", "target"];

/** How many of each group are still to be found. */
export function diceLeft(): Record<DiceKind, number> {
  const groups = diceGroups();
  return Object.fromEntries(KINDS.map((k) => [k, groups[k].filter((x) => !inLab(k, x.id)).length])) as Record<DiceKind, number>;
}

/** One new item: from the group asked for, or from any group with something left. */
export function rollDice(group: DiceKind | null, rnd: () => number = Math.random): { kind: DiceKind; id: string } | null {
  const groups = diceGroups();
  const open = (group ? [group] : KINDS).filter((k) => groups[k].some((x) => !inLab(k, x.id)));
  if (!open.length) return null;
  const kind = open[Math.floor(rnd() * open.length)]!;
  const left = groups[kind].filter((x) => !inLab(kind, x.id));
  return { kind, id: left[Math.floor(rnd() * left.length)]!.id };
}

/** Whether an idea uses this item. */
function uses(idea: LabIdea, kind: DiceKind, id: string): boolean {
  if (kind === "shape") return idea.shape === id;
  if (kind === "world") return idea.world?.id === id;
  if (kind === "power") return idea.power?.id === id;
  if (kind === "target") return idea.target?.id === id;
  return idea.hero?.id === id;
}

export function ideaHref(idea: LabIdea): string {
  const q = new URLSearchParams({
    format: idea.format,
    ...(idea.hero ? { hero: idea.hero.id } : {}),
    ...(idea.world ? { world: idea.world.id } : {}),
    ...(idea.power ? { power: idea.power.id } : {}),
    ...(idea.target ? { target: idea.target.id } : {}),
    ...(idea.shape ? { shape: idea.shape } : {}),
  });
  return `/story-lab?${q.toString()}#blueprint`;
}

/** The ideas an item makes, best first, no partner twice. */
export function opensUp(kind: DiceKind, id: string, videos: LabVideo[], published: PublicVideo[], limit = 5): DiceCard["opens"] {
  const run = () => labIdeas(videos, new Date(), 20_000, published, [], false).filter((i) => uses(i, kind, id));
  const ideas = inLab(kind, id) ? run() : withItem(kind, id, run);
  const partners = new Set<string>();
  const out: DiceCard["opens"] = [];
  for (const idea of ideas) {
    const partner = [idea.hero?.id, idea.world?.id, idea.power?.id, idea.target?.id].filter((x) => x && x !== id).join("|") + (idea.shape ?? "");
    if (partners.has(partner)) continue;
    partners.add(partner);
    out.push({ title: idea.title, format: FORMAT_BY_ID.get(idea.format)?.name ?? idea.format, href: ideaHref(idea) });
    if (out.length >= limit) break;
  }
  return out;
}

/** What a dice item is, in a few lines. */
export function diceCard(kind: DiceKind, id: string, videos: LabVideo[], published: PublicVideo[]): DiceCard | null {
  const item = diceItem(kind, id);
  if (!item) return null;
  const facts: Array<[string, string]> = [];
  let from = "";
  if (kind === "shape") {
    const s = item as Shape;
    from = `on the ${FORMAT_BY_ID.get(s.base)?.name ?? s.base} structure`;
    facts.push(["Title", s.title], ["How it's built", s.pitch]);
  } else if (kind === "world") {
    const w = item as World;
    from = w.kind === "setting" ? "a survival setting" : "a universe to drop a hero into";
    facts.push(["The truth", w.truth], ["Arrival", voice(w.arrival)], ["Roster, weakest first", w.ladder.map((r) => voice(r.name)).join(" → ")], ["Apex", `${w.apex.name} — weak to ${voice(w.apex.weakness)}`]);
    if (w.goal) facts.push(["Surviving means", voice(w.goal)]);
  } else if (kind === "power") {
    const p = item as Power;
    from = p.from;
    facts.push(["Grants", p.grants.join(" · ")], ["The catch", p.cost], ["Can't copy", p.cantCopy], ["Weakness", p.weakness]);
  } else {
    const h = item as Hero;
    from = h.from;
    facts.push(["Version", h.version]);
    if (kind === "target" && h.hides) facts.push(["Hard to catch because", h.hides]);
    else facts.push(["Ability ladder", h.ladder.join(" → ")]);
    facts.push(["Limits", h.limits.join(" · ")], ["The story engine", h.engine]);
  }
  return { kind, group: DICE_LABELS[kind], id, name: item.name, from, facts, opens: opensUp(kind, id, videos, published) };
}
