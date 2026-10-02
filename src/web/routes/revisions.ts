/**
 * Revisions: the list, each channel's history and its mark, and summarizing
 * a cut from its Frame.io comments.
 */
import { listSort } from "./lists.js";
import { type StoredRecord, getRecord, listReviewed, listReviews } from "../../db/records.js";
import { channelHistories } from "../../revisions/history.js";
import { channelMarks, getReview, pastForChannel, revisionHistory, saveReview, setChannelMark, videoKey } from "../../db/revisions.js";
import { commentsFromFrameio, ownNotes, parsePasted } from "../../revisions/comments.js";
import { displayTitle } from "../page.js";
import { hasDatabase } from "../../config.js";
import { refererPath } from "../http.js";
import { renderRevisions } from "../pages/revisions.js";
import { summarize } from "../../revisions/summarize.js";
import { shell, withScores } from "../shell.js";
import type { FastifyInstance } from "fastify";

export function registerRevisions(app: FastifyInstance): void {
  app.get<{ Querystring: { view?: string; ch?: string; sort?: string } }>("/revisions", async (request, reply) => {
    const [s, list] = await Promise.all([shell("reviews"), listReviews(200)]);
    if (request.query.view === "history") {
      const [points, marks, reviewed] = hasDatabase
        ? await Promise.all([revisionHistory(), channelMarks(), listReviewed().then(withScores)])
        : [[], new Map<string, "flag" | "trophy">(), []];
      const sort = (["attention", "best", "name"] as const).find((x) => x === request.query.sort) ?? "attention";
      const channels = channelHistories(
        points.map((p) => ({ recordId: p.recordId, title: p.title, version: p.version, score: p.score, at: p.at, channel: p.channel })),
        marks,
        sort,
      );
      const ch = channels.some((c) => c.channel === request.query.ch) ? request.query.ch! : "";
      return reply.type("text/html").send(
        renderRevisions(s, list, undefined, {
          channels: ch ? channels.filter((c) => c.channel === ch) : channels,
          all: channels.map((c) => c.channel).sort((a, b) => a.localeCompare(b)),
          ch,
          sort,
          reviewed: (ch ? reviewed.filter((r) => (r.channel ?? "No channel") === ch) : reviewed) as Array<StoredRecord & { reviewedAt: Date | null }>,
        }),
      );
    }
    return reply.type("text/html").send(renderRevisions(s, await withScores(list), listSort(request, reply)));
  });

  // Mark a channel from the history: 🚩 find a different editor, 🏆 a run of great cuts, or clear it.
  app.post<{ Body: { channel?: string; mark?: string } }>("/revisions/mark", async (request, reply) => {
    const channel = (request.body?.channel ?? "").trim().slice(0, 200);
    const mark = request.body?.mark === "flag" || request.body?.mark === "trophy" ? request.body.mark : null;
    if (hasDatabase && channel) await setChannelMark(channel, mark);
    return reply.redirect(refererPath(request.headers.referer, "/revisions?view=history"));
  });

  /**
   * Summarize a revision: its Frame.io comments (pasted, or read through the
   * API), your own summary and rating, and the channel's earlier notes for
   * repeats — into a summary and a score out of 10.
   */
  app.post<{ Params: { id: string }; Body: { comments?: string; own?: string; rating?: string } }>("/r/:id/summarize", async (request, reply) => {
    const record = await getRecord(Number(request.params.id));
    if (!record || record.kind !== "review") return reply.redirect(`/r/${request.params.id}`);
    const back = (err?: string) => reply.redirect(`/r/${record.id}${err ? `?sumerr=${encodeURIComponent(err)}` : ""}#summary`);
    const before = await getReview(record.id);
    const pasted = parsePasted((request.body?.comments ?? "").slice(0, 200_000));
    let comments = pasted;
    let source = "pasted";
    let versions = record.version ?? 1;
    if (!pasted.length) {
      const link = record.links.find((l) => l.kind === "frameio");
      const fromApi = link ? await commentsFromFrameio(link.url) : null;
      if (fromApi?.ok) {
        comments = fromApi.comments;
        versions = Math.max(versions, fromApi.versions);
        source = "frameio";
      } else if (before) {
        // Nothing new: the notes already here, summed up again with the new take.
        comments = before.comments.filter((c) => c.source !== "you");
        source = before.source;
      } else if ((request.body?.own ?? "").trim()) {
        comments = [];
      } else {
        return back(fromApi?.error ?? "Paste the cut's Frame.io comments, or write your own summary.");
      }
    }
    versions = Math.max(versions, ...comments.map((c) => c.version ?? 1));
    const ownText = (request.body?.own ?? "").trim().slice(0, 5000);
    const ratingRaw = Number(request.body?.rating);
    const own = request.body?.rating && Number.isFinite(ratingRaw) ? Math.max(1, Math.min(10, ratingRaw)) : null;
    const title = displayTitle(record);
    const video = videoKey(record.code, title);
    const done = await summarize({
      title,
      channel: record.channel,
      comments: [...comments, ...ownNotes(ownText)],
      versions,
      past: await pastForChannel(record.channel, video, new Date()),
      own,
    });
    await saveReview({
      recordId: record.id, channel: record.channel, video, title, version: record.version, versions,
      comments: done.comments, source, summary: done.text, summaryBy: done.by, ownSummary: ownText || null, ownScore: own,
      autoScore: done.breakdown.auto, score: done.breakdown.score, breakdown: done.breakdown,
    });
    return back();
  });
}
