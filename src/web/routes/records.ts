/**
 * One record: its page, its status and marks, a fresh reading of its
 * message, moving it (with the rest of its channel), undoing a move, and
 * putting back a video the posting check pushed.
 */
import { keptUndo, moveWithRest, takeUndo, voFor } from "../moves.js";
import { ORG_TZ, dateIn, derive, usDate } from "../../parse/derive.js";
import { channelSchedule, getRecord, listDaysOff, moveAir, refile, restoreMoves, setNoScript, setPaused, setPinned, setStatus, setUploaded } from "../../db/records.js";
import { classify } from "../../parse/classify.js";
import { getReview } from "../../db/revisions.js";
import { hasDatabase } from "../../config.js";
import { listMissed, undoMissed } from "../../jobs/postcheck.js";
import { refererPath, safeDate, safeMode } from "../http.js";
import { renderList } from "../pages/lists.js";
import { renderRecord } from "../pages/record.js";
import { renderError } from "../page.js";
import { scriptsFor } from "../../db/scripts.js";
import { forgetGaps, shell } from "../shell.js";
import type { FastifyInstance } from "fastify";

export function registerRecords(app: FastifyInstance): void {
  app.get<{ Params: { id: string }; Querystring: { moved?: string; scripterr?: string; sumerr?: string } }>("/r/:id", async (request, reply) => {
    const [s, record, scripts, review] = await Promise.all([
      shell(""),
      getRecord(Number(request.params.id)),
      hasDatabase ? scriptsFor(Number(request.params.id)).catch(() => []) : Promise.resolve([]),
      hasDatabase ? getReview(Number(request.params.id)).catch(() => null) : Promise.resolve(null),
    ]);
    if (!record) return reply.code(404).type("text/html").send(renderList(s, "Not found", "That record is gone.", []));
    // How many of its channel's videos would move with a new air date.
    const from = record.airDate;
    const later =
      from && record.channel && record.batchNo === null && !record.pausedAt
        ? (await channelSchedule(record.channel, "posting", dateIn(ORG_TZ))).filter(
            (r) => r.id !== record.id && r.airDate !== null && r.airDate > from,
          ).length
        : 0;
    const token = request.query.moved ?? "";
    const kept = token ? keptUndo(token) : undefined;
    return reply
      .type("text/html")
      .send(
        renderRecord(s, record, {
          later,
          moved: kept ? { token, text: kept.text } : null,
          scripts,
          scriptError: (request.query.scripterr ?? "").slice(0, 200),
          review,
          frameio: Boolean(process.env.FRAMEIO_TOKEN?.trim()) && record.links.some((l) => l.kind === "frameio"),
          summaryError: (request.query.sumerr ?? "").slice(0, 300),
          missed: hasDatabase ? (await listMissed({ days: 30, recordId: record.id }).catch(() => [])).filter((m) => !m.undoneAt)[0] ?? null : null,
        }),
      );
  });

  app.post<{ Params: { id: string; action: string } }>("/r/:id/:action", async (request, reply) => {
    const { id, action } = request.params;
    // An id that isn't a row id is simply not a record.
    if (!/^[1-9]\d{0,15}$/.test(id)) return reply.code(404).type("text/html").send(renderError(404));
    if (action === "pin" || action === "unpin") {
      await setPinned(Number(id), action === "pin");
      return reply.redirect(refererPath(request.headers.referer, `/r/${id}`));
    }
    // Pause takes it off every deadline until it's resumed; no script marks
    // it as waiting on the writer. Neither touches its status.
    if (action === "pause" || action === "resume") {
      await setPaused(Number(id), action === "pause");
      return reply.redirect(refererPath(request.headers.referer, `/r/${id}`));
    }
    if (action === "uploaded" || action === "notuploaded") {
      await setUploaded(Number(id), action === "uploaded");
      return reply.redirect(refererPath(request.headers.referer, `/r/${id}`));
    }
    if (action === "noscript" || action === "script") {
      await setNoScript(Number(id), action === "noscript");
      return reply.redirect(refererPath(request.headers.referer, `/r/${id}`));
    }
    const status = action === "remove" ? "removed" : action;
    if (status !== "done" && status !== "open" && status !== "removed") {
      return reply.code(400).send("no");
    }
    await setStatus(Number(id), status);
    // Back where you pressed it, so clearing a list does not bounce you away.
    return reply.redirect(refererPath(request.headers.referer, `/r/${id}`));
  });

  // Re-read a record with the parser as it is now. A channel someone set by
  // hand is kept when the fresh reading finds none — a correction is a fact
  // about the message that the parser may still not be able to see.
  app.post<{ Params: { id: string } }>("/r/:id/reread", async (request, reply) => {
    const id = Number(request.params.id);
    const current = await getRecord(id);
    if (!current || !current.raw.trim() || current.parsedBy === "recurring") {
      return reply.redirect(`/r/${id}`);
    }
    const result = await classify({ content: current.raw });
    const fresh = derive(result.extraction, result.raw, current.createdAt);
    if (!fresh.channel && current.channel) {
      fresh.channel = current.channel;
      fresh.category = current.category;
    }
    await refile(id, fresh, result.parsedBy);
    return reply.redirect(`/r/${id}`);
  });

  // A calendar drag. Posting mode moves the air date; Deadlines mode moves
  // whichever deadline the calendar was showing, keeping its time of day. The
  // rest of the channel's schedule follows, unless Shift was held.
  app.post<{ Params: { id: string }; Body: { date?: string; mode?: string; only?: string } }>(
    "/r/:id/move",
    async (request, reply) => {
      const id = Number(request.params.id);
      const date = safeDate(request.body?.date);
      const record = await getRecord(id);
      if (!record || !date) return reply.code(400).send({ ok: false });
      const mode = safeMode(request.body?.mode);
      const moved = await moveWithRest(record, date, mode, request.body?.only === "1");
      if (!moved.ok) return reply.code(400).send({ ok: false });
      // A deadline dropped on a day off lands on the working day before; say so.
      const off = mode === "deadlines" && (await listDaysOff()).includes(date)
        ? `${usDate(date)} is a day off, so it's due the working day before. `
        : "";
      return reply.send({
        ok: true, moved: moved.plan.moves.length, days: moved.plan.days, text: off + moved.text, undo: moved.undo,
      });
    },
  );

  // Put a move back: the dragged video and everything that went with it.
  app.post<{ Body: { token?: string } }>("/moves/undo", async (request, reply) => {
    const kept = takeUndo(String(request.body?.token ?? ""));
    const json = (request.headers.accept ?? "").includes("application/json");
    if (!kept) return json ? reply.code(410).send({ ok: false }) : reply.redirect(refererPath(request.headers.referer, "/calendar"));
    await restoreMoves(kept.snaps);
    if (json) return reply.send({ ok: true });
    // From a record's page: back to it, without the note that offered this.
    const back = refererPath(request.headers.referer, "/calendar");
    return reply.redirect(back.replace(/\?.*$/, ""));
  });

  // The date box on a record's page — for a phone, where dragging is awkward,
  // or for a date weeks away. Empty clears it. With "move the rest" ticked the
  // channel's later videos go with it, as they do on the calendar.
  app.post<{ Params: { id: string }; Body: { air?: string; rest?: string } }>("/r/:id/air", async (request, reply) => {
    const id = Number(request.params.id);
    const raw = (request.body?.air ?? "").trim();
    const date = raw ? safeDate(raw) : null;
    if (raw && !date) return reply.redirect(`/r/${id}`);
    const record = await getRecord(id);
    if (!record) return reply.redirect(`/r/${id}`);
    if (!date || !record.airDate) {
      await moveAir(id, date, voFor(date));
      return reply.redirect(`/r/${id}`);
    }
    const moved = await moveWithRest(record, date, "posting", request.body?.rest !== "1");
    return reply.redirect(moved.undo ? `/r/${id}?moved=${moved.undo}` : `/r/${id}`);
  });

  // It went up after all: put the channel's schedule back and mark it uploaded.
  app.post<{ Params: { id: string } }>("/missed/:id/undo", async (request, reply) => {
    const recordId = hasDatabase ? await undoMissed(Number(request.params.id), restoreMoves) : null;
    forgetGaps();
    return reply.redirect(recordId ? `/r/${recordId}` : refererPath(request.headers.referer, "/"));
  });
}
