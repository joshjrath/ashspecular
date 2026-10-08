/**
 * The dashboard, the bell's notifications (polled by the page), What's new,
 * and clearing a "Nothing assigned" gap.
 */
import { CATEGORIES, CHANNELS } from "../../catalog.js";
import { ORG_TZ, usDate } from "../../parse/derive.js";
import { RELEASES } from "../changelog.js";
import { type StoredRecord, channelCounts, dueByDay, listOffShifted, openByCategory, stats } from "../../db/records.js";
import { dashboardAlerts } from "../finance/ui.js";
import { dismissGaps } from "../../db/channels.js";
import { financeAlerts } from "../finance/routes.js";
import { hasDatabase } from "../../config.js";
import { noticeTitle, renderEmptyState, renderWhatsNew } from "../page.js";
import { refererPath, safeDate } from "../http.js";
import { safeHref } from "../html.js";
import { renderDashboard } from "../pages/dashboard.js";
import { allNotices, cookieList, forgetGaps, nextAssignments, releaseTime, shell, withScores } from "../shell.js";
import type { FastifyInstance } from "fastify";

/**
 * The dashboard's columns, as the page last saved them. "none" means every
 * box was unticked; no cookie means the default three.
 */
function dashColumns(request: import("fastify").FastifyRequest): string[] | undefined {
  const raw = request.cookies.dash_cols;
  if (!raw) return undefined;
  if (raw === "none") return [];
  const known = new Set<string>(CATEGORIES.map((c) => c.id));
  const cols = raw.split(".").filter((id) => known.has(id));
  return cols.length ? cols : undefined;
}

/** When this browser last opened the bell. Set by the page itself. */
function noticesSeen(request: import("fastify").FastifyRequest): number {
  const n = Number(request.cookies.notices_seen);
  return Number.isFinite(n) ? n : 0;
}

export function registerDashboard(app: FastifyInstance): void {
  app.get("/", async (request, reply) => {
    if (!hasDatabase) return reply.type("text/html").send(renderEmptyState());

    const [s, counters, byDay, grouped, channels, notices, shifted, finAlerts, nextUp] = await Promise.all([
      shell("dashboard"),
      stats(ORG_TZ),
      dueByDay(ORG_TZ, 14),
      openByCategory(),
      channelCounts(),
      allNotices(),
      listOffShifted(),
      financeAlerts().catch((err) => (console.error("[finance] alerts failed:", err), [])),
      nextAssignments().catch(() => []),
    ]);

    // Revisions get their own section; the columns are the work to voice.
    const revisions = await withScores([...grouped.values()].flat().filter((r) => r.kind === "review"));
    const due = (r: StoredRecord) => (r.deadline ?? r.voDue ?? r.scriptDue)?.getTime() ?? Infinity;
    revisions.sort((a, b) => Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt)) || due(a) - due(b));
    const columns = new Map([...grouped].map(([k, list]) => [k, list.filter((r) => r.kind !== "review")] as const));
    return reply
      .type("text/html")
      .send(
        renderDashboard(s, {
          stats: counters, byDay, grouped: columns, channels, notices, seen: noticesSeen(request), revisions, gaps: s.gaps,
          cols: dashColumns(request), shifted: shifted.map((x) => x.record),
          order: cookieList("dash_order"),
          finance: dashboardAlerts(finAlerts),
          nextUp,
          hideParts: cookieList("dash_hide").filter((x) => x === "unsorted" || x === "channels" || x === "revisions"),
        }),
      );
  });

  // The bell's contents, for the dashboard to poll: the unread count and, for
  // desktop alerts, what came in.
  app.get("/notifications.json", async (request, reply) => {
    const seen = noticesSeen(request);
    const notices = await allNotices();
    return reply.send({
      unread: notices.filter((n) => n.at.getTime() > seen).length,
      items: notices.map((n) =>
        n.kind === "update"
          ? { id: n.release.id, kind: n.kind, at: n.at.getTime(), title: n.release.title, channel: null, href: `/whats-new#${n.release.id}` }
          : n.kind === "network"
          ? { id: n.alert.key, kind: n.kind, at: n.at.getTime(), title: n.alert.text, channel: n.alert.channel, href: safeHref(n.alert.href ?? "") || "/network" }
          : n.kind === "gap"
          ? { id: `${n.gap.channel}:${n.gap.date}`, kind: n.kind, at: n.at.getTime(), title: `Nothing assigned for ${usDate(n.gap.date)}`, channel: n.gap.channel, href: `/day/${n.gap.date}` }
          : { id: n.record.id, kind: n.kind, at: n.at.getTime(), title: noticeTitle(n.record), channel: n.record.channel, href: `/r/${n.record.id}` },
      ),
    });
  });

  app.get("/whats-new", async (_request, reply) => {
    const s = await shell("whatsnew");
    return reply.type("text/html").send(renderWhatsNew(s, RELEASES.map((r) => ({ ...r, at: releaseTime(r.id) }))));
  });

  // Clear a "Nothing assigned" day (or several): that channel isn't posting then after all.
  app.post<{ Body: { channel?: string; days?: string | string[] } }>("/gaps/dismiss", async (request, reply) => {
    const channel = CHANNELS.find((c) => c.name === request.body?.channel)?.name;
    const raw = request.body?.days;
    const days = (Array.isArray(raw) ? raw : String(raw ?? "").split(",")).map((d) => safeDate(d.trim())).filter((d): d is string => Boolean(d));
    if (hasDatabase && channel && days.length) {
      await dismissGaps(channel, days);
      forgetGaps();
    }
    return reply.redirect(refererPath(request.headers.referer, "/"));
  });
}
