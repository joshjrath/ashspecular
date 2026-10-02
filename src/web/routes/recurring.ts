/**
 * Recurring: today's daily batches and working ahead, a reading day's
 * progress, and clearing a day's batches.
 */
import { CHANNELS } from "../../catalog.js";
import { MAX_AHEAD_DAYS, batchDays, batchStatus, openBatchesFor, openBatchesThrough, setBatchProgress, shortsDay, todayStatus, tomorrow } from "../../jobs/batches.js";
import { clearBatches, listBatchesOn } from "../../db/records.js";
import { refererPath, safeDate } from "../http.js";
import { renderRecurring } from "../pages/recurring.js";
import { shiftDate } from "../../parse/derive.js";
import { shell } from "../shell.js";
import type { FastifyInstance } from "fastify";

export function registerRecurring(app: FastifyInstance): void {
  // Today, and any day ahead — ?day= picks it, tomorrow by default.
  app.get<{ Querystring: { day?: string } }>("/recurring", async (request, reply) => {
    const today = shortsDay();
    const first = tomorrow();
    const picked = safeDate(request.query.day);
    const day = picked && picked >= first ? picked : first;
    const [s, todayNow, aheadRows, list, strip] = await Promise.all([
      shell("recurring"),
      todayStatus(),
      batchStatus(day),
      listBatchesOn(today),
      batchDays(first, shiftDate(first, 13)),
    ]);
    return reply
      .type("text/html")
      .send(
        renderRecurring(
          s,
          { date: today, rows: todayNow.rows },
          { date: day, rows: aheadRows },
          list,
          strip,
          MAX_AHEAD_DAYS,
        ),
      );
  });

  // Working ahead, as far as you like: one day (day=), the next N days
  // (days=), or every day through a date (through=). The opener is
  // idempotent, so a morning run later finds these and leaves them alone —
  // cleared ones included — and a partly open day gets only what it lacks.
  app.post<{ Body: { day?: string; days?: string; through?: string } }>("/recurring/ahead", async (request, reply) => {
    const first = tomorrow();
    const body = request.body ?? {};
    const day = safeDate(body.day);
    const through = safeDate(body.through);
    const n = Math.min(Math.max(Number(body.days) || 0, 0), MAX_AHEAD_DAYS);
    let show = first;
    if (day && day >= first) {
      await openBatchesFor(day);
      show = day;
    } else if (through && through >= first) {
      const last = through <= shiftDate(first, MAX_AHEAD_DAYS - 1) ? through : shiftDate(first, MAX_AHEAD_DAYS - 1);
      await openBatchesThrough(first, last);
      show = first;
    } else if (n > 0) {
      await openBatchesThrough(first, shiftDate(first, n - 1));
    } else {
      await openBatchesFor(first);
    }
    return reply.redirect(`/recurring?day=${show}`);
  });

  // One segment on a reading channel's day: how many of its uploads are done.
  app.post<{ Body: { channel?: string; date?: string; done?: string } }>(
    "/recurring/progress",
    async (request, reply) => {
      const channel = request.body?.channel;
      const date = safeDate(request.body?.date);
      const done = Number(request.body?.done);
      if (channel && date && Number.isInteger(done) && CHANNELS.some((c) => c.name === channel)) {
        await setBatchProgress(channel, date, done);
      }
      return reply.redirect(refererPath(request.headers.referer, "/recurring"));
    },
  );

  app.post<{ Body: { channel?: string; date?: string } }>("/recurring/clear", async (request, reply) => {
    const channel = request.body?.channel;
    const date = safeDate(request.body?.date);
    if (channel && date && CHANNELS.some((c) => c.name === channel)) {
      await clearBatches(channel, date);
    }
    return reply.redirect(refererPath(request.headers.referer, "/recurring"));
  });
}
