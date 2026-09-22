import { pool } from "./pool.js";
import type { Extraction } from "../parse/schema.js";
import { parseTimestamp, todayBounds } from "../time.js";

export type Status = "inbox" | "active" | "blocked" | "done" | "archived";
export const STATUSES: Status[] = ["inbox", "active", "blocked", "done", "archived"];
export const OPEN_STATUSES: Status[] = ["inbox", "active", "blocked"];

export interface ItemLink {
  url: string;
  kind: string;
  label: string;
}

export interface Item {
  id: string;
  lane: string;
  kind: string;
  status: Status;
  title: string;
  summary: string;
  project: string | null;
  priority: number;
  due_at: Date | null;
  vo_needed: boolean;
  vo_due_at: Date | null;
  links: ItemLink[];
  tags: string[];
  source_guild_id: string | null;
  source_channel_id: string | null;
  source_message_id: string | null;
  source_author: string | null;
  source_url: string | null;
  raw_content: string;
  parsed_by: string;
  parse_model: string | null;
  confidence: number;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface SourceInfo {
  guildId: string | null;
  channelId: string;
  messageId: string;
  author: string;
  url: string;
  raw: string;
}

export async function createItem(
  extraction: Extraction,
  source: SourceInfo,
  meta: { parsedBy: string; model: string | null },
): Promise<Item> {
  const { rows } = await pool.query<Item>(
    `INSERT INTO items (
       lane, kind, title, summary, project, priority,
       due_at, vo_needed, vo_due_at, links, tags,
       source_guild_id, source_channel_id, source_message_id,
       source_author, source_url, raw_content,
       parsed_by, parse_model, confidence
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10::jsonb, $11::text[],
       $12, $13, $14,
       $15, $16, $17,
       $18, $19, $20
     )
     ON CONFLICT (source_message_id) DO NOTHING
     RETURNING *`,
    [
      extraction.lane,
      extraction.kind,
      extraction.title.slice(0, 200),
      extraction.summary,
      extraction.project,
      extraction.priority,
      parseTimestamp(extraction.due_at),
      extraction.vo_needed,
      parseTimestamp(extraction.vo_due_at),
      JSON.stringify(extraction.links),
      extraction.tags,
      source.guildId,
      source.channelId,
      source.messageId,
      source.author,
      source.url,
      source.raw,
      meta.parsedBy,
      meta.model,
      extraction.confidence,
    ],
  );

  if (rows[0]) {
    await logEvent(rows[0].id, "created", { lane: extraction.lane }, source.author);
    return rows[0];
  }

  // The message was already filed (a retry, or a duplicate gateway delivery).
  const existing = await findBySourceMessage(source.messageId);
  if (!existing) throw new Error("insert conflicted but no existing row found");
  return existing;
}

export async function findBySourceMessage(messageId: string): Promise<Item | null> {
  const { rows } = await pool.query<Item>(
    "SELECT * FROM items WHERE source_message_id = $1",
    [messageId],
  );
  return rows[0] ?? null;
}

export async function getItem(id: string | number): Promise<Item | null> {
  const { rows } = await pool.query<Item>("SELECT * FROM items WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export interface ListFilter {
  lanes?: string[];
  statuses?: Status[];
  /** Only items due (or with VO due) before the end of today. */
  todayOnly?: boolean;
  search?: string;
  limit?: number;
}

export async function listItems(filter: ListFilter = {}): Promise<Item[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  const statuses = filter.statuses?.length ? filter.statuses : OPEN_STATUSES;
  params.push(statuses);
  where.push(`status = ANY($${params.length}::text[])`);

  if (filter.lanes?.length) {
    params.push(filter.lanes);
    where.push(`lane = ANY($${params.length}::text[])`);
  }
  if (filter.todayOnly) {
    params.push(todayBounds().end);
    where.push(`(due_at <= $${params.length} OR vo_due_at <= $${params.length})`);
  }
  if (filter.search?.trim()) {
    params.push(`%${filter.search.trim()}%`);
    const p = `$${params.length}`;
    where.push(`(title ILIKE ${p} OR summary ILIKE ${p} OR project ILIKE ${p} OR raw_content ILIKE ${p})`);
  }

  params.push(Math.min(filter.limit ?? 300, 500));

  const { rows } = await pool.query<Item>(
    `SELECT * FROM items
     WHERE ${where.join(" AND ")}
     ORDER BY
       CASE status WHEN 'blocked' THEN 0 ELSE 1 END,
       priority ASC,
       COALESCE(vo_due_at, due_at) ASC NULLS LAST,
       created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

const PATCHABLE = [
  "lane",
  "kind",
  "status",
  "title",
  "summary",
  "project",
  "priority",
  "due_at",
  "vo_needed",
  "vo_due_at",
] as const;

export type Patch = Partial<Record<(typeof PATCHABLE)[number], unknown>>;

export async function updateItem(
  id: string | number,
  patch: Patch,
  actor = "dashboard",
): Promise<Item | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const key of PATCHABLE) {
    if (!(key in patch)) continue;
    params.push(patch[key]);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) return getItem(id);

  sets.push("updated_at = now()");
  if (patch.status === "done") sets.push("completed_at = now()");
  if (patch.status && patch.status !== "done") sets.push("completed_at = NULL");

  params.push(id);
  const { rows } = await pool.query<Item>(
    `UPDATE items SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );

  if (rows[0]) await logEvent(rows[0].id, "updated", patch, actor);
  return rows[0] ?? null;
}

export async function logEvent(
  itemId: string | number,
  event: string,
  detail: unknown,
  actor = "system",
): Promise<void> {
  await pool.query(
    "INSERT INTO item_events (item_id, event, detail, actor) VALUES ($1, $2, $3::jsonb, $4)",
    [itemId, event, JSON.stringify(detail ?? {}), actor],
  );
}

/**
 * The daily digest: the highest-priority open long-form work, deadlines and
 * VO-needed items first, oldest tiebreak so nothing rots at the bottom.
 */
export async function topPriorities(lane: string, limit: number): Promise<Item[]> {
  const { rows } = await pool.query<Item>(
    `SELECT * FROM items
     WHERE lane = $1 AND status = ANY($2::text[])
     ORDER BY
       priority ASC,
       COALESCE(vo_due_at, due_at) ASC NULLS LAST,
       created_at ASC
     LIMIT $3`,
    [lane, OPEN_STATUSES, limit],
  );
  return rows;
}

export async function laneCounts(): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ lane: string; count: string }>(
    `SELECT lane, COUNT(*)::text AS count FROM items
     WHERE status = ANY($1::text[]) GROUP BY lane`,
    [OPEN_STATUSES],
  );
  return Object.fromEntries(rows.map((r) => [r.lane, Number(r.count)]));
}

export async function recordDigest(
  localDateStr: string,
  itemIds: string[],
  messageUrl: string | null,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO digests (local_date, item_ids, message_url)
     VALUES ($1, $2::bigint[], $3)
     ON CONFLICT (local_date) DO NOTHING`,
    [localDateStr, itemIds, messageUrl],
  );
  return rowCount === 1;
}

export async function digestExists(localDateStr: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "SELECT 1 FROM digests WHERE local_date = $1",
    [localDateStr],
  );
  return rowCount === 1;
}
