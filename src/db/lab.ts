import type { DiceKind } from "../web/stories/dice.js";
import type { IdeaMark } from "../web/stories/writenext.js";
import { pool } from "./pool.js";

/** What's been added from Story Lab's dice, in the order it was added. */
export async function listLabAdditions(): Promise<Array<{ kind: DiceKind; id: string; addedAt: Date }>> {
  const { rows } = await pool.query<{ kind: DiceKind; id: string; added_at: Date }>(
    "SELECT kind, id, added_at FROM lab_additions ORDER BY added_at ASC, kind, id",
  );
  return rows.map((r) => ({ kind: r.kind, id: r.id, addedAt: r.added_at }));
}

export async function addLabAddition(kind: DiceKind, id: string): Promise<void> {
  await pool.query("INSERT INTO lab_additions (kind, id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [kind, id]);
}

export async function removeLabAddition(kind: DiceKind, id: string): Promise<void> {
  await pool.query("DELETE FROM lab_additions WHERE kind = $1 AND id = $2", [kind, id]);
}

// ── Write next: rerolled away, or saved for later ─────────────────────────

/** Every channel's marks. Rerolls older than 60 days lapse, so an idea can come round again. */
export async function listIdeaMarks(): Promise<IdeaMark[]> {
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT * FROM lab_idea_marks WHERE mark <> 'skip' OR marked_at > now() - interval '60 days' ORDER BY marked_at DESC`,
  );
  return rows.map((r) => ({
    channel: r.channel as string, key: r.key as string, mark: r.mark as IdeaMark["mark"], title: r.title as string,
    format: r.format as string, hero: (r.hero as string) ?? null, world: (r.world as string) ?? null, power: (r.power as string) ?? null,
    target: (r.target as string) ?? null, shape: (r.shape as string) ?? null, score: r.score as number, markedAt: r.marked_at as Date,
  }));
}

export async function markIdea(m: Omit<IdeaMark, "markedAt">): Promise<void> {
  await pool.query(
    `INSERT INTO lab_idea_marks (channel, key, mark, title, format, hero, world, power, target, shape, score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (channel, key) DO UPDATE SET mark = EXCLUDED.mark, title = EXCLUDED.title, score = EXCLUDED.score, marked_at = now()`,
    [m.channel, m.key, m.mark, m.title, m.format, m.hero, m.world, m.power, m.target, m.shape, m.score],
  );
}

export async function unmarkIdea(channel: string, key: string): Promise<void> {
  await pool.query("DELETE FROM lab_idea_marks WHERE channel = $1 AND key = $2", [channel, key]);
}

/** The cards a channel is showing now: kept until they're rerolled or saved. */
export async function setShowing(channel: string, cards: Array<Omit<IdeaMark, "markedAt" | "mark" | "channel">>): Promise<void> {
  await pool.query("DELETE FROM lab_idea_marks WHERE channel = $1 AND mark = 'show' AND NOT (key = ANY($2::text[]))", [channel, cards.map((c) => c.key)]);
  for (const c of cards) {
    await pool.query(
      `INSERT INTO lab_idea_marks (channel, key, mark, title, format, hero, world, power, target, shape, score)
       VALUES ($1, $2, 'show', $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (channel, key) DO NOTHING`,
      [channel, c.key, c.title, c.format, c.hero, c.world, c.power, c.target, c.shape, c.score],
    );
  }
}
