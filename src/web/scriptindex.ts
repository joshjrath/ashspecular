/**
 * Where a video's script is, if anywhere:
 *
 *   attached    pasted or linked on its page (the Script box)
 *   Story Lab   one of the scripts Story Lab learns from, by its title
 *   Scripts     delivered on the Scripts tab (Josh's board), by code or title
 *
 * Rebuilt whenever what it reads changes; looking a video up is a map read,
 * so every card on a page can ask.
 */
import type { ScriptRow } from "./scriptcheck.js";

export interface ScriptHit {
  /** Plain words for where: "attached", "Story Lab", "Scripts tab". */
  where: string[];
  /** The best place to open it. */
  href: string;
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\bv(?:er|ersion)?\.?\s*\d{1,2}\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Entry = { where: string; href: string; rank: number };

let byId = new Map<number, Entry[]>();
let byCode = new Map<string, Entry[]>();
let byTitle = new Map<string, Entry[]>();

const push = (m: Map<string, Entry[]> | Map<number, Entry[]>, k: string | number, e: Entry) => {
  const list = (m as Map<string | number, Entry[]>).get(k) ?? [];
  if (!list.some((x) => x.where === e.where)) list.push(e);
  (m as Map<string | number, Entry[]>).set(k, list);
};

/** Build the index from everything that holds scripts. */
export function setScriptIndex(src: {
  attached: Array<{ recordId: number | null; title: string }>;
  lab: Array<{ title: string }>;
  delivered: ScriptRow[];
}): void {
  byId = new Map();
  byCode = new Map();
  byTitle = new Map();
  for (const a of src.attached) {
    const e = { where: "attached", href: a.recordId ? `/r/${a.recordId}#script` : "/story-lab#scripts", rank: 0 };
    if (a.recordId) push(byId, a.recordId, e);
    push(byTitle, norm(a.title), e);
  }
  for (const s of src.lab) push(byTitle, norm(s.title), { where: "Story Lab", href: "/story-lab#scripts", rank: 2 });
  for (const r of src.delivered) {
    if (!r.delivered.length) continue;
    const e = { where: "Scripts tab", href: r.delivered[r.delivered.length - 1]!, rank: 1 };
    if (r.code) push(byCode, r.code.toUpperCase(), e);
    push(byTitle, norm(r.title), e);
  }
}

/** A video's script, by its record, code or title. Null when there's none anywhere. */
export function scriptFor(v: { id?: number | null; code?: string | null; title?: string | null }): ScriptHit | null {
  const found = [
    ...(v.id ? byId.get(v.id) ?? [] : []),
    ...(v.code ? byCode.get(v.code.toUpperCase()) ?? [] : []),
    ...(v.title ? byTitle.get(norm(v.title)) ?? [] : []),
  ];
  if (!found.length) return null;
  const where = [...new Set(found.sort((a, b) => a.rank - b.rank).map((e) => e.where))];
  return { where, href: found[0]!.href };
}
