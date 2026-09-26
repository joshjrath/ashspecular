/**
 * What's been added from Story Lab's dice, in memory: the new worlds, heroes,
 * opponents and powers live in the lore itself; the new title shapes live
 * here. Applied from the database at start and after every add or remove.
 */
import { resetCorpus } from "./corpus.js";
import { DICE_HEROES, DICE_POWERS, DICE_SHAPES, DICE_TARGETS, DICE_WORLDS, type DiceKind, type Shape } from "./dice.js";
import { HERO_BY_ID, POWER_BY_ID, WORLD_BY_ID, addLore, resetLore, type Hero, type Power, type World } from "./lore.js";

/** Title shapes added from the dice, on top of the formats the scripts built. */
export const SHAPES: Shape[] = [];
export const SHAPE_BY_ID = new Map<string, Shape>();

/** A dice item by group and id. */
export function diceItem(kind: DiceKind, id: string): Shape | World | Hero | Power | null {
  const list: Array<Shape | World | Hero | Power> =
    kind === "shape" ? DICE_SHAPES : kind === "world" ? DICE_WORLDS : kind === "hero" ? DICE_HEROES : kind === "target" ? DICE_TARGETS : DICE_POWERS;
  return list.find((x) => x.id === id) ?? null;
}

/** Whether an item is already part of Story Lab — added, or in the lore as written. */
export function inLab(kind: DiceKind, id: string): boolean {
  if (kind === "shape") return SHAPE_BY_ID.has(id);
  if (kind === "world") return WORLD_BY_ID.has(id);
  if (kind === "power") return POWER_BY_ID.has(id);
  return HERO_BY_ID.has(id);
}

/** Put one item in (applyAdditions keeps the record of what's in). */
function addItem(kind: DiceKind, id: string): boolean {
  const item = diceItem(kind, id);
  if (!item || inLab(kind, id)) return false;
  if (kind === "shape") {
    SHAPES.push(item as Shape);
    SHAPE_BY_ID.set(id, item as Shape);
  } else {
    addLore(kind === "target" ? "hero" : kind, item as World | Hero | Power);
  }
  return true;
}

let applied: Array<{ kind: DiceKind; id: string }> = [];

/** Exactly these additions, in this order, and nothing else. */
export function applyAdditions(list: Array<{ kind: DiceKind; id: string }>): void {
  resetLore();
  SHAPES.length = 0;
  SHAPE_BY_ID.clear();
  applied = [];
  for (const a of list) if (addItem(a.kind, a.id)) applied.push(a);
  resetCorpus();
}

export function currentAdditions(): Array<{ kind: DiceKind; id: string }> {
  return [...applied];
}

/** Run something as if this item were added — for a roll's preview — then put things back. */
export function withItem<T>(kind: DiceKind, id: string, fn: () => T): T {
  const before = currentAdditions();
  if (!addItem(kind, id)) return fn();
  resetCorpus();
  try {
    return fn();
  } finally {
    applyAdditions(before);
  }
}

/** A shape's title with the names filled in, or null if it needs one that isn't there. */
export function fillShape(shape: Shape, names: { hero?: string | null; world?: string | null; power?: string | null; target?: string | null }): string | null {
  let missing = false;
  const title = shape.title.replace(/\{(hero|world|power|target)\}/g, (_, k: "hero" | "world" | "power" | "target") => {
    const v = names[k];
    if (!v) missing = true;
    return v ?? "";
  });
  return missing ? null : title;
}
