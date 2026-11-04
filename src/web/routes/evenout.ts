/**
 * Even out uploads: the preview (a GET, changes nothing), applying it and
 * its Undo (POSTs). See web/evenout.ts for how the plan is made.
 */
import type { FastifyInstance } from "fastify";
import { CHANNELS } from "../../catalog.js";
import { channelSchedule, clearResetUndo, getResetUndo, lastPostedDay, moveAir, restoreMoves, saveResetUndo, snapshotMoves, upcomingAirDays } from "../../db/records.js";
import { pausedChannels } from "../../db/channels.js";
import { inTransaction } from "../../db/pool.js";
import { hasDatabase } from "../../config.js";
import { ORG_TZ, VO_BUFFER_DAYS, dateIn, shiftDate } from "../../parse/derive.js";
import { type EvenChannel, planEvenOut } from "../evenout.js";
import { voFor } from "../moves.js";
import { displayTitle } from "../page.js";
import { formText } from "../http.js";
import { forgetGaps, refreshOwnPaces, shell } from "../shell.js";
import { canSetEvery, everyFor } from "../targets.js";
import { renderEvenOut } from "../pages/evenout.js";

/** Undo stays offered this long after evening out. */
const UNDO_HOURS = 24;
const UNDO_KEY = "calendar_even_undo";

const spreadOf = (v: unknown) => formText(v) !== "spacing";

/** Every long-form channel with a frequency, its upcoming uploads and its last one; the rest of the calendar as fixed days. */
async function makePlan(spread: boolean, today = dateIn(ORG_TZ)) {
  await refreshOwnPaces();
  const paused = await pausedChannels().catch(() => new Map<string, Date>());
  const planned = CHANNELS.filter((c) => canSetEvery(c) && !paused.has(c.name) && (everyFor(c.name) ?? 0) > 0);
  const channels: EvenChannel[] = await Promise.all(planned.map(async (c) => {
    const [schedule, last] = await Promise.all([channelSchedule(c.name, "posting", today), lastPostedDay(c.name, today)]);
    return {
      channel: c.name, every: everyFor(c.name)!, last,
      videos: schedule.filter((r) => r.airDate && !r.uploadedAt).map((r) => ({ id: r.id, air: r.airDate!, label: r.code ? `${r.code} · ${displayTitle(r)}` : displayTitle(r) })),
    };
  }));
  const fixed = await upcomingAirDays(today, planned.map((c) => c.name));
  return { plan: planEvenOut({ today, floor: shiftDate(today, VO_BUFFER_DAYS), channels, fixed, spread }) };
}

export function registerEvenOut(app: FastifyInstance): void {
  app.get<{ Querystring: Record<string, string> }>("/calendar/even", async (request, reply) => {
    const spread = spreadOf(request.query.how);
    const [s, made, undo] = await Promise.all([shell("calendar"), hasDatabase ? makePlan(spread) : null, hasDatabase ? getResetUndo(UNDO_KEY) : null]);
    const undoOpen = undo && Date.now() - undo.at.getTime() < UNDO_HOURS * 3_600_000 ? undo : null;
    return reply.type("text/html").send(renderEvenOut(s, {
      spread, plan: made?.plan ?? null,
      undo: undoOpen ? { at: undoOpen.at, text: undoOpen.text } : null,
      done: formText(request.query.done).slice(0, 200), undone: request.query.undone === "1",
    }));
  });

  app.post<{ Body: Record<string, string> }>("/calendar/even", async (request, reply) => {
    const spread = spreadOf(request.body?.how);
    const back = `/calendar/even${spread ? "" : "?how=spacing"}`;
    if (request.body?.confirm !== "1") return reply.redirect(back);
    const { plan } = await makePlan(spread);
    if (!plan.moves.length) return reply.redirect(back);
    const snaps = await snapshotMoves(plan.moves.map((m) => m.id));
    // Every upload, and its VO and script deadlines with it, together or not at all.
    await inTransaction(async (db) => {
      for (const m of plan.moves) await moveAir(m.id, m.to, voFor(m.to), db, m.shift);
    });
    const channels = new Set(plan.moves.map((m) => m.channel)).size;
    const most = Math.max(...plan.days.map((d) => d.after));
    const text = `${plan.moves.length} upload${plan.moves.length === 1 ? "" : "s"} on ${channels} channel${channels === 1 ? "" : "s"} moved to their upload frequency${spread ? `, at most ${most} a day` : ""}; their VO and script deadlines moved with them.`;
    await saveResetUndo(snaps, text, UNDO_KEY);
    forgetGaps();
    console.log(`[even out] ${text}`);
    return reply.redirect(`${back}${spread ? "?" : "&"}done=${encodeURIComponent(text)}`);
  });

  app.post("/calendar/even/undo", async (_request, reply) => {
    const undo = await getResetUndo(UNDO_KEY);
    if (undo && Date.now() - undo.at.getTime() < UNDO_HOURS * 3_600_000) {
      await restoreMoves(undo.snaps);
      forgetGaps();
      console.log(`[even out] undone: ${undo.text}`);
    }
    await clearResetUndo(UNDO_KEY);
    return reply.redirect("/calendar/even?undone=1");
  });
}
