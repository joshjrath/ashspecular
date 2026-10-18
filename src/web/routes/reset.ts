/**
 * Future reset: the preview (a GET, changes nothing), the reset itself and
 * its Undo (POSTs). See web/reset.ts for how the plan is made.
 */
import type { FastifyInstance } from "fastify";
import { channelSchedule, clearResetUndo, getResetUndo, listDaysOff, moveAir, moveDue, restoreMoves, saveResetUndo, snapshotMoves } from "../../db/records.js";
import { averageLongFormViews } from "../../db/network.js";
import { getDayEnd } from "../../db/timers.js";
import { inTransaction } from "../../db/pool.js";
import { hasDatabase } from "../../config.js";
import { DEADLINE_TIME, ORG_TZ, dateIn, instantIn, shiftDate } from "../../parse/derive.js";
import { RESET_BOUNDS, type ResetVideo, type ResetVo, planReset } from "../reset.js";
import { isVo, workdayOf } from "../work.js";
import { voFor } from "../moves.js";
import { displayTitle } from "../page.js";
import { formText } from "../http.js";
import { forgetGaps, loadWork, shell } from "../shell.js";
import { renderReset } from "../pages/reset.js";

/** Undo stays offered this long after a reset. */
const UNDO_HOURS = 24;

const perDayOf = (v: unknown) => {
  const n = Number(formText(v));
  return Number.isInteger(n) && n >= RESET_BOUNDS.min && n <= RESET_BOUNDS.max ? n : RESET_BOUNDS.fallback;
};

/** Everything the plan needs, read fresh: the late VOs, the rest, their channels' schedules, views, days off. */
async function makePlan(perDay: number, now = new Date()) {
  const [ended, work, daysOff, avgViews] = await Promise.all([getDayEnd(), loadWork(now), listDaysOff(), averageLongFormViews().catch(() => new Map<string, number>())]);
  const workday = workdayOf(now, ended);
  const vos = work.items.filter((i) => isVo(i.type) && i.id !== null && i.due && i.record && !i.record.pausedAt);
  const asVo = (i: (typeof vos)[number]): ResetVo => ({
    id: i.id!, channel: i.channel ?? "(no channel)", title: i.title, airDate: i.airDate, voDay: dateIn(ORG_TZ, i.due!),
  });
  const late = vos.filter((i) => i.due!.getTime() < now.getTime()).map(asVo);
  const upcoming = vos.filter((i) => i.due!.getTime() >= now.getTime()).map(asVo);
  // Each channel with late VOs: its schedule from its earliest late upload on, minus what's already up.
  const firstAir = new Map<string, string>();
  for (const v of late) if (v.airDate && v.channel && (!firstAir.has(v.channel) || v.airDate < firstAir.get(v.channel)!)) firstAir.set(v.channel, v.airDate);
  const schedule: ResetVideo[] = (
    await Promise.all([...firstAir].map(([ch, from]) => channelSchedule(ch, "posting", from)))
  ).flat().filter((r) => r.airDate && !r.uploadedAt).map((r) => ({ id: r.id, channel: r.channel!, airDate: r.airDate!, label: r.code ?? displayTitle(r) }));
  // From the day after the one My Day is on; if today's already ended, My Day is on tomorrow and VOs can start there.
  const start = workday.ahead ? workday.day : shiftDate(workday.day, 1);
  const plan = planReset({ start, perDay, daysOff: new Set(daysOff), late, upcoming, schedule, avgViews });
  return { plan, start, workday, lateCount: late.length };
}

export function registerReset(app: FastifyInstance): void {
  app.get<{ Querystring: Record<string, string> }>("/calendar/reset", async (request, reply) => {
    const perDay = perDayOf(request.query.per);
    const [s, made, undo] = await Promise.all([shell("calendar"), hasDatabase ? makePlan(perDay) : null, hasDatabase ? getResetUndo() : null]);
    const undoOpen = undo && Date.now() - undo.at.getTime() < UNDO_HOURS * 3_600_000 ? undo : null;
    return reply.type("text/html").send(renderReset(s, {
      perDay, plan: made?.plan ?? null, start: made?.start ?? dateIn(ORG_TZ), lateCount: made?.lateCount ?? 0,
      undo: undoOpen ? { at: undoOpen.at, text: undoOpen.text } : null,
      done: formText(request.query.done).slice(0, 200), undone: request.query.undone === "1",
    }));
  });

  app.post<{ Body: Record<string, string> }>("/calendar/reset", async (request, reply) => {
    const perDay = perDayOf(request.body?.per);
    if (request.body?.confirm !== "1") return reply.redirect(`/calendar/reset?per=${perDay}`);
    const { plan } = await makePlan(perDay);
    if (!plan.assign.size) return reply.redirect(`/calendar/reset?per=${perDay}`);
    const ids = [...new Set([...plan.moves.map((m) => m.id), ...plan.assign.keys()])];
    const snaps = await snapshotMoves(ids);
    // Every upload and every VO day, together or not at all.
    await inTransaction(async (db) => {
      for (const m of plan.moves) await moveAir(m.id, m.to, voFor(m.to), db, m.shift);
      for (const [id, day] of plan.assign) await moveDue(id, "vo_due", instantIn(day, DEADLINE_TIME, ORG_TZ)!, db);
    });
    const channels = new Set(plan.moves.map((m) => m.channel)).size;
    const text = `${plan.assign.size} late VO${plan.assign.size === 1 ? "" : "s"} spread over ${plan.days.length} day${plan.days.length === 1 ? "" : "s"}; ${plan.moves.length} upload${plan.moves.length === 1 ? "" : "s"} on ${channels} channel${channels === 1 ? "" : "s"} moved later.`;
    await saveResetUndo(snaps, text);
    forgetGaps();
    console.log(`[reset] ${text}`);
    return reply.redirect(`/calendar/reset?per=${perDay}&done=${encodeURIComponent(text)}`);
  });

  app.post("/calendar/reset/undo", async (_request, reply) => {
    const undo = await getResetUndo();
    if (undo && Date.now() - undo.at.getTime() < UNDO_HOURS * 3_600_000) {
      await restoreMoves(undo.snaps);
      forgetGaps();
      console.log(`[reset] undone: ${undo.text}`);
    }
    await clearResetUndo();
    return reply.redirect("/calendar/reset?undone=1");
  });
}
