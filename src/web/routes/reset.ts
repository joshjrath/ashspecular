/**
 * Future reset and Even out deadlines: each a preview (a GET, changes
 * nothing), the change itself and its Undo (POSTs). See web/reset.ts and
 * web/evendeadlines.ts for how the plans are made.
 */
import type { FastifyInstance } from "fastify";
import { channelSchedule, clearResetUndo, getResetUndo, listDaysOff, moveAir, moveDue, restoreMoves, saveResetUndo, snapshotMoves } from "../../db/records.js";
import { averageLongFormViews } from "../../db/network.js";
import { getDayEnd } from "../../db/timers.js";
import { inTransaction } from "../../db/pool.js";
import { hasDatabase } from "../../config.js";
import { DEADLINE_TIME, ORG_TZ, dateIn, instantIn, shiftDate } from "../../parse/derive.js";
import { RESET_BOUNDS, type ResetVideo, type ResetVo, type StartFrom, planReset, startDays } from "../reset.js";
import { isVo, workdayOf } from "../work.js";
import { voFor } from "../moves.js";
import { displayTitle } from "../page.js";
import { formText } from "../http.js";
import { forgetGaps, loadWork, refreshOwnPaces, shell } from "../shell.js";
import { everyFor } from "../targets.js";
import { renderReset } from "../pages/reset.js";
import { planEvenDeadlines } from "../evendeadlines.js";
import { renderEvenDeadlines } from "../pages/evendeadlines.js";

/** Undo stays offered this long after a reset. */
const UNDO_HOURS = 24;

const perDayOf = (v: unknown) => {
  const n = Number(formText(v));
  return Number.isInteger(n) && n >= RESET_BOUNDS.min && n <= RESET_BOUNDS.max ? n : RESET_BOUNDS.fallback;
};

const fromOf = (v: unknown): StartFrom => (formText(v) === "today" ? "today" : "tomorrow");

/** Everything a plan needs, read fresh: the late VOs, the rest, their channels' schedules and frequencies, views, days off. */
async function resetInputs(now = new Date()) {
  const [ended, work, daysOff, avgViews] = await Promise.all([getDayEnd(), loadWork(now), listDaysOff(), averageLongFormViews().catch(() => new Map<string, number>())]);
  const workday = workdayOf(now, ended);
  const vos = work.items.filter((i) => isVo(i.type) && i.id !== null && i.due && i.record && !i.record.pausedAt);
  const asVo = (i: (typeof vos)[number]): ResetVo => ({
    id: i.id!, channel: i.channel ?? "(no channel)", title: i.title, airDate: i.airDate, voDay: dateIn(ORG_TZ, i.due!),
  });
  const late = vos.filter((i) => i.due!.getTime() < now.getTime()).map(asVo);
  const upcoming = vos.filter((i) => i.due!.getTime() >= now.getTime()).map(asVo);
  // Each channel with pending VOs: its schedule from its earliest pending upload on, minus what's already up.
  const firstAir = new Map<string, string>();
  for (const v of [...late, ...upcoming]) if (v.airDate && v.channel && (!firstAir.has(v.channel) || v.airDate < firstAir.get(v.channel)!)) firstAir.set(v.channel, v.airDate);
  const schedule: ResetVideo[] = (
    await Promise.all([...firstAir].map(([ch, from]) => channelSchedule(ch, "posting", from)))
  ).flat().filter((r) => r.airDate && !r.uploadedAt).map((r) => ({ id: r.id, channel: r.channel!, airDate: r.airDate!, label: r.code ?? displayTitle(r) }));
  // Each channel's upload frequency: uploads in the plan stay at least that far apart.
  await refreshOwnPaces();
  const every = new Map([...new Set(schedule.map((x) => x.channel))].map((ch) => [ch, everyFor(ch)] as const).filter((e): e is [string, number] => e[1] !== null));
  return { workday, starts: startDays(workday), daysOff: new Set(daysOff), late, upcoming, schedule, avgViews, every };
}

async function makePlan(perDay: number, from: StartFrom, now = new Date()) {
  const r = await resetInputs(now);
  const start = r.starts[from];
  const plan = planReset({ start, perDay, daysOff: r.daysOff, late: r.late, upcoming: r.upcoming, schedule: r.schedule, avgViews: r.avgViews, every: r.every });
  return { plan, start, starts: r.starts, workday: r.workday, lateCount: r.late.length };
}

export function registerReset(app: FastifyInstance): void {
  app.get<{ Querystring: Record<string, string> }>("/calendar/reset", async (request, reply) => {
    const perDay = perDayOf(request.query.per);
    const from = fromOf(request.query.from);
    const [s, made, undo] = await Promise.all([shell("calendar"), hasDatabase ? makePlan(perDay, from) : null, hasDatabase ? getResetUndo() : null]);
    const undoOpen = undo && Date.now() - undo.at.getTime() < UNDO_HOURS * 3_600_000 ? undo : null;
    return reply.type("text/html").send(renderReset(s, {
      perDay, from, starts: made?.starts ?? { today: dateIn(ORG_TZ), tomorrow: shiftDate(dateIn(ORG_TZ), 1) },
      plan: made?.plan ?? null, start: made?.start ?? dateIn(ORG_TZ), lateCount: made?.lateCount ?? 0,
      undo: undoOpen ? { at: undoOpen.at, text: undoOpen.text } : null,
      done: formText(request.query.done).slice(0, 200), undone: request.query.undone === "1",
    }));
  });

  app.post<{ Body: Record<string, string> }>("/calendar/reset", async (request, reply) => {
    const perDay = perDayOf(request.body?.per);
    const from = fromOf(request.body?.from);
    const back = `/calendar/reset?per=${perDay}&from=${from}`;
    if (request.body?.confirm !== "1") return reply.redirect(back);
    const { plan, lateCount } = await makePlan(perDay, from);
    if (!plan.assign.size) return reply.redirect(back);
    const ids = [...new Set([...plan.moves.map((m) => m.id), ...plan.assign.keys()])];
    const snaps = await snapshotMoves(ids);
    // Every upload and every VO day, together or not at all.
    await inTransaction(async (db) => {
      for (const m of plan.moves) await moveAir(m.id, m.to, voFor(m.to), db, m.shift);
      for (const [id, day] of plan.assign) await moveDue(id, "vo_due", instantIn(day, DEADLINE_TIME, ORG_TZ)!, db);
    });
    const channels = new Set(plan.moves.map((m) => m.channel)).size;
    const moved = plan.assign.size - lateCount;
    const text = `${lateCount} late VO${lateCount === 1 ? "" : "s"}${moved > 0 ? ` (and ${moved} already due, moved to make room)` : ""} spread over ${plan.days.length} day${plan.days.length === 1 ? "" : "s"}; ${plan.moves.length} upload${plan.moves.length === 1 ? "" : "s"} on ${channels} channel${channels === 1 ? "" : "s"} moved later.`;
    await saveResetUndo(snaps, text);
    forgetGaps();
    console.log(`[reset] ${text}`);
    return reply.redirect(`${back}&done=${encodeURIComponent(text)}`);
  });

  // ── Even out deadlines ──
  const EVEN_UNDO = "calendar_evendue_undo";
  const planDue = async (perDay: number, from: StartFrom) => {
    const r = await resetInputs();
    return { r, plan: planEvenDeadlines({ start: r.starts[from], perDay, daysOff: r.daysOff, late: r.late, upcoming: r.upcoming, schedule: r.schedule, avgViews: r.avgViews, every: r.every }) };
  };

  app.get<{ Querystring: Record<string, string> }>("/calendar/even-deadlines", async (request, reply) => {
    const perDay = perDayOf(request.query.per);
    const from = fromOf(request.query.from);
    const [s, made, undo] = await Promise.all([shell("calendar"), hasDatabase ? planDue(perDay, from) : null, hasDatabase ? getResetUndo(EVEN_UNDO) : null]);
    const undoOpen = undo && Date.now() - undo.at.getTime() < UNDO_HOURS * 3_600_000 ? undo : null;
    return reply.type("text/html").send(renderEvenDeadlines(s, {
      perDay, from, starts: made?.r.starts ?? { today: dateIn(ORG_TZ), tomorrow: shiftDate(dateIn(ORG_TZ), 1) }, plan: made?.plan ?? null, daysOff: made?.r.daysOff ?? new Set(),
      undo: undoOpen ? { at: undoOpen.at, text: undoOpen.text } : null,
      done: formText(request.query.done).slice(0, 200), undone: request.query.undone === "1",
    }));
  });

  app.post<{ Body: Record<string, string> }>("/calendar/even-deadlines", async (request, reply) => {
    const perDay = perDayOf(request.body?.per);
    const from = fromOf(request.body?.from);
    const back = `/calendar/even-deadlines?per=${perDay}&from=${from}`;
    if (request.body?.confirm !== "1") return reply.redirect(back);
    const { plan } = await planDue(perDay, from);
    if (!plan.assign.size && !plan.moves.length) return reply.redirect(back);
    const movedAir = new Set(plan.moves.map((m) => m.id));
    // Every VO whose day changes, and every one whose upload moves (moving the upload moves its VO too): each to its planned day.
    const setDue = plan.vos.filter((x) => plan.assign.has(x.id) || movedAir.has(x.id));
    const snaps = await snapshotMoves([...new Set([...movedAir, ...setDue.map((x) => x.id)])]);
    await inTransaction(async (db) => {
      for (const m of plan.moves) await moveAir(m.id, m.to, voFor(m.to), db, m.shift);
      for (const x of setDue) await moveDue(x.id, "vo_due", instantIn(x.to, DEADLINE_TIME, ORG_TZ)!, db);
    });
    const late = plan.vos.filter((x) => x.kind === "late").length;
    const text = `${plan.assign.size} VO day${plan.assign.size === 1 ? "" : "s"} lined up with their uploads, at most ${perDay} a day${late ? ` (${late} late)` : ""}${plan.moves.length ? `; ${plan.moves.length} upload${plan.moves.length === 1 ? "" : "s"} moved later to make room` : ""}.`;
    await saveResetUndo(snaps, text, EVEN_UNDO);
    forgetGaps();
    console.log(`[even deadlines] ${text}`);
    return reply.redirect(`${back}&done=${encodeURIComponent(text)}`);
  });

  app.post("/calendar/even-deadlines/undo", async (_request, reply) => {
    const undo = await getResetUndo(EVEN_UNDO);
    if (undo && Date.now() - undo.at.getTime() < UNDO_HOURS * 3_600_000) {
      await restoreMoves(undo.snaps);
      forgetGaps();
      console.log(`[even deadlines] undone: ${undo.text}`);
    }
    await clearResetUndo(EVEN_UNDO);
    return reply.redirect("/calendar/even-deadlines?undone=1");
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
