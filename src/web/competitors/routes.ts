/** Competitors' routes: the niche pages, and managing niches, channels and settings. */
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  addChannel, addGroup, deleteGroup, getChannel, getCompSettings, latestRead, listAlerts, listChannels, listGroups, markAlertsSeen, refreshNow, removeChannel,
  renameGroup, saveCompSettings, updateChannel, usageToday, compSetting, DEFAULT_COMP,
} from "../../db/competitors.js";
import { CHANNELS } from "../../catalog.js";
import type { Shell } from "../page.js";
import { canUseClaude } from "../../ai/claude.js";
import { ytKey } from "../../competitors/youtube.js";
import { loadNiche } from "../../competitors/niche.js";
import { channelStats, conceptGaps, emergingTopics, inFormat, mainFormat, myPosition, relatedGaps, topVideos, whatsWorking, type FormatPick, type SortKey } from "../../competitors/analysis.js";
import { median } from "../performance.js";
import { readChannel } from "../../jobs/competitors.js";
import { renderChannel, renderEmpty, renderGaps, renderManage, renderNiche, renderVideos, type NicheQuery } from "./pages.js";

type Q = Record<string, string | undefined>;
const str = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") : "").trim();
const idOf = (v: unknown) => {
  const n = Number(str(v));
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function registerCompetitors(app: FastifyInstance, shell: (active: string) => Promise<Shell>): void {
  const html = (reply: FastifyReply, s: string) => reply.type("text/html").send(s);
  const status = async () => {
    const u = await usageToday();
    return { key: Boolean(ytKey()), ai: canUseClaude(), quota: u.youtube, calls: u.ai };
  };
  const query = (q: Q, fallback: FormatPick): NicheQuery => ({
    format: q.f === "long" || q.f === "short" || q.f === "all" ? q.f : fallback,
    days: [7, 30, 90, 3650].includes(Number(q.d)) ? Number(q.d) : 30,
  });

  app.get("/competitors", async (_request, reply) => {
    const groups = await listGroups();
    if (!groups.length) return html(reply, renderEmpty(await shell("competitors")));
    return reply.redirect(`/competitors/${groups[0]!.id}`);
  });

  app.get<{ Params: { gid: string }; Querystring: Q }>("/competitors/:gid", async (request, reply) => {
    const gid = idOf(request.params.gid);
    const n = gid ? await loadNiche(gid) : null;
    if (!n) return reply.redirect("/competitors");
    const q = query(request.query, mainFormat(n.rows));
    const rows = inFormat(n.rows, q.format);
    const s = n.settings;
    const [groups, alerts, read, st, sh] = await Promise.all([listGroups(), listAlerts(20, n.group.id), latestRead(n.group.id), status(), shell("competitors")]);
    const stats = n.channels.map((c) => channelStats(c, rows, s.outlier));
    const page = renderNiche(sh, {
      groups, group: n.group, q, settings: s, channels: n.channels, rows,
      hottest: topVideos(rows, { sort: "multiple", days: q.days, competitorsOnly: true, limit: 8 }).filter((r) => (r.multiple ?? 0) > 1),
      gaps: conceptGaps(rows, n.planned, { days: q.days, outlier: s.outlier, staleMonths: s.staleMonths, now: n.now }),
      working: whatsWorking(rows, { days: q.days, outlier: s.outlier }),
      emerging: emergingTopics(rows),
      stats, position: myPosition(stats),
      recent: topVideos(rows, { sort: "date", days: null, competitorsOnly: true, limit: 8 }),
      alerts, read, status: { key: st.key, ai: st.ai, quotaUsed: st.quota, aiUsed: st.calls },
      flash: request.query.msg?.slice(0, 200),
    });
    // Seen once the niche has been opened.
    await markAlertsSeen(n.group.id).catch(() => undefined);
    return html(reply, page);
  });

  app.get<{ Params: { gid: string }; Querystring: Q }>("/competitors/:gid/gaps", async (request, reply) => {
    const gid = idOf(request.params.gid);
    const n = gid ? await loadNiche(gid) : null;
    if (!n) return reply.redirect("/competitors");
    const q = query(request.query, mainFormat(n.rows));
    const rows = inFormat(n.rows, q.format);
    const s = n.settings;
    const gaps = conceptGaps(rows, n.planned, { days: q.days, outlier: s.outlier, staleMonths: s.staleMonths, now: n.now });
    const open = request.query.c ? gaps.find((g) => g.key === request.query.c) ?? null : null;
    // Broader trends: outliers by pattern, and how many of my videos share it.
    const trendMap = new Map<string, { outliers: number; channels: Set<number>; covered: number }>();
    for (const r of rows) {
      const t = r.concept?.trend;
      if (!t) continue;
      const e = trendMap.get(t) ?? { outliers: 0, channels: new Set<number>(), covered: 0 };
      if (r.channel.mine) e.covered++;
      else if (r.ageDays <= q.days && (r.multiple ?? 0) >= s.outlier) { e.outliers++; e.channels.add(r.channel.id); }
      trendMap.set(t, e);
    }
    const trends = [...trendMap].filter(([, e]) => e.outliers > 0).map(([trend, e]) => ({ trend, outliers: e.outliers, channels: e.channels.size, covered: e.covered })).sort((a, b) => b.outliers - a.outliers).slice(0, 20);
    return html(reply, renderGaps(await shell("competitors"), { groups: await listGroups(), group: n.group, q, settings: s, gaps, status: str(request.query.status), open, related: open ? relatedGaps(open, gaps) : [], trends }));
  });

  app.get<{ Params: { gid: string }; Querystring: Q }>("/competitors/:gid/videos", async (request, reply) => {
    const gid = idOf(request.params.gid);
    const n = gid ? await loadNiche(gid) : null;
    if (!n) return reply.redirect("/competitors");
    const q = query(request.query, mainFormat(n.rows));
    const sort: SortKey = (["multiple", "views", "perday", "date"] as const).find((x) => x === request.query.sort) ?? "multiple";
    const rows = topVideos(inFormat(n.rows, q.format), { sort, days: q.days === 3650 ? null : q.days, competitorsOnly: request.query.mine !== "1", limit: 120 });
    return html(reply, renderVideos(await shell("competitors"), { groups: await listGroups(), group: n.group, q, settings: n.settings, sort, rows }));
  });

  app.get<{ Params: { cid: string } }>("/competitors/c/:cid", async (request, reply) => {
    const c = await getChannel(idOf(request.params.cid) ?? 0);
    if (!c) return reply.redirect("/competitors");
    const n = await loadNiche(c.groupId);
    if (!n) return reply.redirect("/competitors");
    const own = n.rows.filter((r) => r.channel.id === c.id);
    const format = mainFormat(own);
    const rows = inFormat(n.rows, format);
    const s = n.settings;
    const stats = n.channels.map((x) => channelStats(x, rows, s.outlier));
    const me = stats.find((x) => x.channel.id === c.id)!;
    const mineRows = rows.filter((r) => r.channel.id === c.id);
    const months = new Map<string, number[]>();
    for (const r of mineRows) {
      if (r.ageDays > 365 || r.ageDays < 7 || r.video.views === null) continue;
      const m = r.video.publishedAt.toISOString().slice(0, 7);
      months.set(m, [...(months.get(m) ?? []), r.video.views]);
    }
    const trend = [...months].sort((a, b) => a[0].localeCompare(b[0])).map(([month, xs]) => ({ month, median: median(xs), n: xs.length }));
    const gaps = conceptGaps(rows, n.planned, { days: 90, outlier: s.outlier, staleMonths: s.staleMonths, now: n.now })
      .filter((g) => (g.coverage === "never" || g.coverage === "stale") && g.outliers.some((r) => r.channel.id === c.id)).slice(0, 6);
    return html(reply, renderChannel(await shell("competitors"), {
      groups: await listGroups(), group: n.group, settings: s, stats: me, niche: myPosition(stats).niche, trend, gaps,
      top: [...mineRows].filter((r) => r.multiple !== null).sort((a, b) => b.multiple! - a.multiple!).slice(0, 8),
      recent: [...mineRows].sort((a, b) => b.video.publishedAt.getTime() - a.video.publishedAt.getTime()).slice(0, 12),
    }));
  });

  app.get<{ Querystring: Q }>("/competitors/manage", async (request, reply) => {
    const [groups, channels, settings, st] = await Promise.all([listGroups(), listChannels(), getCompSettings(), status()]);
    return html(reply, renderManage(await shell("competitors"), { groups, channels, settings, flash: request.query.msg?.slice(0, 200), error: request.query.err?.slice(0, 200), status: { key: st.key, ai: st.ai } }));
  });

  const back = (reply: FastifyReply, to: string, msg: { msg?: string; err?: string }) =>
    reply.redirect(`${to}${to.includes("?") ? "&" : "?"}${new URLSearchParams(msg as Record<string, string>).toString()}`);

  app.post<{ Body: Q }>("/competitors/groups", async (request, reply) => {
    const r = await addGroup(str(request.body?.name));
    return "error" in r ? back(reply, "/competitors/manage", { err: r.error }) : reply.redirect(`/competitors/${r.id}#add`);
  });
  app.post<{ Params: { id: string }; Body: Q }>("/competitors/groups/:id", async (request, reply) => {
    const r = await renameGroup(idOf(request.params.id) ?? 0, str(request.body?.name));
    return back(reply, "/competitors/manage", "error" in r ? { err: r.error } : { msg: "Renamed." });
  });
  app.post<{ Params: { id: string } }>("/competitors/groups/:id/delete", async (request, reply) => {
    await deleteGroup(idOf(request.params.id) ?? 0);
    return back(reply, "/competitors/manage", { msg: "Niche deleted." });
  });

  app.post<{ Body: Q }>("/competitors/channels", async (request, reply) => {
    const b = request.body ?? {};
    const gid = idOf(b.to) ?? idOf(b.group);
    if (!gid) return back(reply, "/competitors/manage", { err: "Pick a niche." });
    const board = CHANNELS.find((c) => c.name === str(b.board))?.name ?? null;
    const url = str(b.url);
    if (!board && !url) return back(reply, `/competitors/${gid}`, { msg: "Paste a channel link, or pick one of the board's channels." });
    const r = await addChannel({ groupId: gid, input: board ?? url, youtubeId: null, mine: Boolean(board) || b.mine === "1", boardChannel: board });
    if ("error" in r) return back(reply, `/competitors/${gid}`, { msg: r.error });
    // Read it straight away so the page fills in (a backfill takes a few seconds).
    const c = await getChannel(r.id);
    // A failure is kept on the channel (its error shows below); the log says why too.
    if (c && !c.boardChannel) await readChannel(c).catch((err) => console.error("[competitors] first read failed:", err));
    const after = await getChannel(r.id);
    return back(reply, `/competitors/${gid}`, { msg: after?.error ? `Added, but: ${after.error}` : `Added ${after?.title ?? board ?? "the channel"}.` });
  });
  app.post<{ Params: { id: string }; Body: Q }>("/competitors/channels/:id", async (request, reply) => {
    const id = idOf(request.params.id) ?? 0;
    const to = idOf(request.body?.to);
    await updateChannel(id, { ...(to ? { groupId: to } : {}), mine: request.body?.mine === "1" });
    return back(reply, "/competitors/manage", { msg: "Saved." });
  });
  app.post<{ Params: { id: string } }>("/competitors/channels/:id/delete", async (request, reply) => {
    await removeChannel(idOf(request.params.id) ?? 0);
    return back(reply, "/competitors/manage", { msg: "Removed." });
  });
  app.post<{ Params: { id: string } }>("/competitors/channels/:id/refresh", async (request, reply) => {
    const id = idOf(request.params.id) ?? 0;
    await refreshNow(id);
    const c = await getChannel(id);
    if (c) await readChannel(c).catch((err) => console.error("[competitors] refresh failed:", err));
    return reply.redirect(`/competitors/c/${id}`);
  });
  app.post<{ Body: Q }>("/competitors/settings", async (request, reply) => {
    const b = request.body ?? {};
    // A field left empty or not a number goes back to its default.
    const n = (k: keyof typeof DEFAULT_COMP) => compSetting(k, b[k], DEFAULT_COMP[k]);
    await saveCompSettings({ outlier: n("outlier"), major: n("major"), staleMonths: n("staleMonths"), quota: n("quota"), aiCalls: n("aiCalls") });
    return back(reply, "/competitors/manage", { msg: "Settings saved." });
  });
}
