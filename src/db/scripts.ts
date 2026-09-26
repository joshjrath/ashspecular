import { pool } from "./pool.js";

/** A script kept on the board: pasted in, or read from a Google Doc. */
export interface StoredScript {
  id: number;
  recordId: number | null;
  /** The video's category when it's attached to one; null when it stands alone. */
  category: string | null;
  title: string;
  body: string;
  url: string | null;
  words: number;
  addedAt: Date;
  updatedAt: Date;
}

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean).length;

const SELECT = `SELECT s.id, s.record_id, r.category, s.title, s.body, s.url, s.words, s.added_at, s.updated_at
  FROM scripts s LEFT JOIN records r ON r.id = s.record_id`;

function row(r: Record<string, unknown>): StoredScript {
  return {
    id: Number(r.id),
    recordId: r.record_id == null ? null : Number(r.record_id),
    category: (r.category as string | null) ?? null,
    title: r.title as string,
    body: r.body as string,
    url: (r.url as string | null) ?? null,
    words: r.words as number,
    addedAt: r.added_at as Date,
    updatedAt: r.updated_at as Date,
  };
}

/** Every script, oldest first. */
export async function listScripts(): Promise<StoredScript[]> {
  const { rows } = await pool.query(`${SELECT} ORDER BY s.added_at ASC, s.id ASC`);
  return rows.map(row);
}

export async function scriptsFor(recordId: number): Promise<StoredScript[]> {
  const { rows } = await pool.query(`${SELECT} WHERE s.record_id = $1 ORDER BY s.added_at DESC, s.id DESC`, [recordId]);
  return rows.map(row);
}

export async function getScript(id: number): Promise<StoredScript | null> {
  const { rows } = await pool.query(`${SELECT} WHERE s.id = $1`, [id]);
  return rows[0] ? row(rows[0]) : null;
}

export async function addScript(s: { recordId: number | null; title: string; body: string; url: string | null }): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO scripts (record_id, title, body, url, words) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [s.recordId, s.title, s.body, s.url, wordsOf(s.body)],
  );
  return rows[0]!.id;
}

export async function updateScriptBody(id: number, body: string): Promise<void> {
  await pool.query("UPDATE scripts SET body = $2, words = $3, updated_at = now() WHERE id = $1", [id, body, wordsOf(body)]);
}

export async function removeScript(id: number): Promise<void> {
  await pool.query("DELETE FROM scripts WHERE id = $1", [id]);
}
