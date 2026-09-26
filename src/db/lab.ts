import type { DiceKind } from "../web/stories/dice.js";
import { pool } from "./pool.js";

/** What's been added from Story Lab's dice, in the order it was added. */
export async function listLabAdditions(): Promise<Array<{ kind: DiceKind; id: string }>> {
  const { rows } = await pool.query<{ kind: DiceKind; id: string }>(
    "SELECT kind, id FROM lab_additions ORDER BY added_at ASC, kind, id",
  );
  return rows;
}

export async function addLabAddition(kind: DiceKind, id: string): Promise<void> {
  await pool.query("INSERT INTO lab_additions (kind, id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [kind, id]);
}

export async function removeLabAddition(kind: DiceKind, id: string): Promise<void> {
  await pool.query("DELETE FROM lab_additions WHERE kind = $1 AND id = $2", [kind, id]);
}
