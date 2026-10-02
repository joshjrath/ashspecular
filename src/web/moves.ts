/**
 * Moving a video to another day, the way the calendar means it: its air date
 * (posting) or whichever deadline the calendar shows (deadlines). Unless told
 * otherwise, the rest of its channel's schedule after it moves too — in one
 * transaction — and the move can be undone for fifteen minutes.
 *
 * Used by the calendar drag, a record's date box, and the daily posting check.
 */
import { type CalendarMode, type MoveSnapshot, type StoredRecord, channelSchedule, moveAir, moveDue, snapshotMoves } from "../db/records.js";
import { type Cascade, cascadeText, planCascade } from "./cascade.js";
import { DEADLINE_TIME, ORG_TZ, VO_BUFFER_DAYS, dateIn, instantIn, shiftDate } from "../parse/derive.js";
import { type Db, inTransaction } from "../db/pool.js";
import { dayOf } from "./cadence.js";
import { displayTitle } from "./page.js";
import { randomUUID } from "node:crypto";

/** The VO a new air date implies, by the studio's rule. */
export const voFor = (air: string | null) =>
  air ? instantIn(shiftDate(air, -VO_BUFFER_DAYS), DEADLINE_TIME, ORG_TZ) : null;

/** A deadline's time of day, so moving it to another day keeps it. */
const timeOf = (at: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: ORG_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);

/** Whichever deadline the Deadlines calendar shows a record by. */
const dueOf = (r: StoredRecord) =>
  r.voDue ? { field: "vo_due" as const, at: r.voDue }
    : r.deadline ? { field: "deadline" as const, at: r.deadline }
      : r.scriptDue ? { field: "script_due" as const, at: r.scriptDue }
        : null;

/** Where the calendar shows a record, in the given mode. */
const dayIn = (r: StoredRecord, mode: CalendarMode) => {
  if (mode === "posting") return r.airDate;
  const due = dueOf(r);
  return due ? dayOf(due.at) : null;
};

/** Put a record on another day, the way the calendar in that mode means it. */
async function placeOn(r: StoredRecord, date: string, mode: CalendarMode, db: Db): Promise<boolean> {
  if (mode === "posting") {
    await moveAir(r.id, date, voFor(date), db);
    return true;
  }
  const due = dueOf(r);
  const at = due ? instantIn(date, timeOf(due.at), ORG_TZ) : null;
  if (!due || !at) return false;
  await moveDue(r.id, due.field, at, db);
  return true;
}

/**
 * Undo for a move that took the rest of a channel with it. Kept in memory for
 * fifteen minutes: long enough to notice, and a restart simply ends it.
 */
const undos = new Map<string, { at: number; snaps: MoveSnapshot[]; text: string }>();
const UNDO_MS = 15 * 60_000;
/** The move a token can undo, while it's kept: what moved, and the note that offers it. */
export const keptUndo = (token: string) => undos.get(token);
/** Use an undo up: it's gone once taken (a second press finds nothing). */
export function takeUndo(token: string) {
  const kept = undos.get(token);
  undos.delete(token);
  return kept;
}
function keepUndo(snaps: MoveSnapshot[], text: string): string {
  for (const [k, v] of undos) if (Date.now() - v.at > UNDO_MS) undos.delete(k);
  const token = randomUUID();
  undos.set(token, { at: Date.now(), snaps, text });
  return token;
}

/**
 * Move one record and, unless told otherwise, the rest of its channel's
 * schedule after it. Daily batches, paused videos and records with no
 * channel only ever move themselves.
 */
export async function moveWithRest(
  record: StoredRecord,
  date: string,
  mode: CalendarMode,
  alone: boolean,
): Promise<{ ok: boolean; plan: Cascade; undo: string | null; text: string }> {
  const none: Cascade = { days: 0, asked: 0, moves: [] };
  const from = dayIn(record, mode);
  const today = dateIn(ORG_TZ);
  const schedule =
    alone || !from || !record.channel || record.batchNo !== null || record.pausedAt
      ? []
      : await channelSchedule(record.channel, mode, today);
  const plan = from && schedule.length
    ? planCascade(
        { id: record.id, from, to: date },
        schedule.map((r) => ({ id: r.id, date: dayIn(r, mode)!, label: r.code ?? displayTitle(r) })),
        today,
      )
    : none;
  const snaps = plan.moves.length ? await snapshotMoves([record.id, ...plan.moves.map((m) => m.id)]) : [];
  const byId = new Map(schedule.map((r) => [r.id, r]));
  // The video and the rest of its channel move together, or not at all.
  const placed = await inTransaction(async (db) => {
    if (!(await placeOn(record, date, mode, db))) return false;
    for (const m of plan.moves) await placeOn(byId.get(m.id)!, m.to, mode, db);
    return true;
  });
  if (!placed) return { ok: false, plan: none, undo: null, text: "" };
  const text = plan.moves.length ? cascadeText(record.channel!, plan) : "";
  return { ok: true, plan, undo: plan.moves.length ? keepUndo(snaps, text) : null, text };
}
