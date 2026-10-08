/**
 * Network Overview's routes: the page and its exports, and Settings →
 * Network & revenue (divisions, channels, RPM assumptions).
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { CATEGORIES } from "../../catalog.js";
import { addChannel } from "../../db/channelsettings.js";
import {
  CURRENCIES, addDivision, deleteDivision, deleteRpm, listDivisions, listNetChannels, listRpm, moveChannel, moveDivision, readStatus, readingCoverage,
  recentAlerts, renameDivision, rpmValue, saveRpm, setChannelPlace,
} from "../../db/network.js";
import { listChannelLinks, setChannelLink } from "../../jobs/youtube.js";
import { loadDataset } from "../../network/dataset.js";
import { EXPORTS, exportRows, type ExportKind } from "../../network/export.js";
import { buildOverview, readQuery } from "../../network/overview.js";
import { periodOf } from "../../network/period.js";
import { ORG_TZ, dateIn, shiftDate } from "../../parse/derive.js";
import { formText, safeDate, toCsv } from "../http.js";
import { renderNetwork } from "../pages/network.js";
import { renderNetworkSettings } from "../pages/networksettings.js";
import { forgetPaces, shell } from "../shell.js";

/** Readings older than this are shown as stale. */
const STALE_HOURS = 3;

async function overviewFor(query: Record<string, unknown>, now: Date) {
  const [channels, divisions] = await Promise.all([listNetChannels(), listDivisions()]);
  const q = readQuery(query, { divisions: divisions.map((d) => d.id), channels: channels.map((c) => c.id) });
  const today = dateIn(ORG_TZ, now);
  // Readings from the earliest day any section needs: the period's comparison, or two months for momentum.
  const rough = periodOf(q.preset, today, { from: q.from, to: q.to, firstDay: shiftDate(today, -1095) });
  const from = [rough.prev?.from ?? rough.from, rough.from, shiftDate(today, -62)].sort()[0]!;
  const ds = await loadDataset({ from, scoreSince: Math.min(400, Math.max(30, rough.days + 30)), now });
  return { ds, overview: buildOverview(ds, q, now) };
}

export function registerNetwork(app: FastifyInstance): void {
  const html = (reply: FastifyReply, s: string) => reply.type("text/html").send(s);

  app.get<{ Querystring: Record<string, string> }>("/network", async (request, reply) => {
    const now = new Date();
    const [s, status, alerts, links] = await Promise.all([shell("network"), readStatus(), recentAlerts(14).catch(() => []), listChannelLinks()]);
    const { overview } = await overviewFor(request.query, now);
    const linked = new Set(links.filter((l) => l.youtubeId).map((l) => l.channel));
    return html(reply, renderNetwork(s, overview, {
      lastRead: status.lastRead,
      stale: status.lastRead ? now.getTime() - status.lastRead.getTime() > STALE_HOURS * 3_600_000 : false,
      linked: overview.selected.filter((c) => linked.has(c.name)).length,
      unlinked: overview.selected.filter((c) => !linked.has(c.name)).map((c) => c.name),
      errors: overview.selected.filter((c) => c.error).map((c) => ({ name: c.name, error: c.error! })),
      key: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
      alerts: alerts.filter((a) => !a.channel || overview.selected.some((c) => c.name === a.channel)),
    }));
  });

  app.get<{ Querystring: Record<string, string> }>("/network/export.csv", async (request, reply) => {
    const kind: ExportKind = (EXPORTS as readonly string[]).includes(request.query.kind ?? "") ? (request.query.kind as ExportKind) : "channels";
    const now = new Date();
    const [{ ds, overview }, status] = await Promise.all([overviewFor(request.query, now), readStatus()]);
    const csv = toCsv(exportRows(kind, overview, ds.ix, ds.videos, status.lastRead));
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="specular-network-${kind}-${overview.period.from}-to-${overview.period.to}.csv"`)
      .send(csv);
  });

  // ── Settings → Network & revenue ─────────────────────────────────────────
  const back = (reply: FastifyReply, msg: { saved?: string; error?: string }, anchor: string) =>
    reply.redirect(`/settings/network?${new URLSearchParams(msg as Record<string, string>).toString()}${anchor}`);

  app.get<{ Querystring: Record<string, string> }>("/settings/network", async (request, reply) => {
    const [s, divisions, channels, rpm, coverage, links] = await Promise.all([
      shell("settings"), listDivisions(), listNetChannels(), listRpm(), readingCoverage(), listChannelLinks(),
    ]);
    return html(reply, renderNetworkSettings(s, {
      divisions, channels, rpm, coverage, links: new Map(links.map((l) => [l.channel, l.input])), today: dateIn(ORG_TZ),
      saved: formText(request.query.saved).slice(0, 200), error: formText(request.query.error).slice(0, 200),
    }));
  });

  app.post<{ Body: Record<string, string> }>("/settings/network/divisions/add", async (request, reply) => {
    const r = await addDivision(formText(request.body?.name), formText(request.body?.colour));
    return back(reply, "error" in r ? { error: r.error } : { saved: "Division added." }, "#divisions");
  });
  app.post<{ Params: { id: string }; Body: Record<string, string> }>("/settings/network/divisions/:id", async (request, reply) => {
    const r = await renameDivision(request.params.id, formText(request.body?.name), formText(request.body?.colour));
    return back(reply, "error" in r ? { error: r.error } : { saved: "Division saved." }, "#divisions");
  });
  app.post<{ Params: { id: string } }>("/settings/network/divisions/:id/delete", async (request, reply) => {
    const r = await deleteDivision(request.params.id);
    return back(reply, "error" in r ? { error: r.error } : { saved: "Division deleted." }, "#divisions");
  });
  app.post<{ Params: { id: string }; Body: Record<string, string> }>("/settings/network/divisions/:id/move", async (request, reply) => {
    await moveDivision(request.params.id, formText(request.body?.dir) === "up" ? -1 : 1);
    return back(reply, {}, "#divisions");
  });

  app.post<{ Body: Record<string, string> }>("/settings/network/channels", async (request, reply) => {
    const b = request.body ?? {};
    const [channels, divisions, links] = await Promise.all([listNetChannels(), listDivisions(), listChannelLinks()]);
    const known = new Set(divisions.map((d) => d.id));
    const linkOf = new Map(links.map((l) => [l.channel, l.input]));
    let relinked = 0;
    for (const c of channels) {
      const div = formText(b[`div_${c.id}`]);
      await setChannelPlace(c.name, { divisionId: known.has(div) ? div : null, active: b[`on_${c.id}`] === "1" });
      const link = formText(b[`link_${c.id}`]).slice(0, 300);
      if (link !== (linkOf.get(c.name) ?? "")) { await setChannelLink(c.name, link); relinked += 1; }
    }
    if (relinked) forgetPaces();
    return back(reply, { saved: `Channels saved${relinked ? `; ${relinked} link${relinked === 1 ? "" : "s"} changed, read within the hour` : ""}.` }, "#channels");
  });
  app.post<{ Params: { id: string }; Body: Record<string, string> }>("/settings/network/channels/:id/move", async (request, reply) => {
    const c = (await listNetChannels()).find((x) => x.id === request.params.id);
    if (c) await moveChannel(c.name, formText(request.body?.dir) === "up" ? -1 : 1);
    return back(reply, {}, "#channels");
  });
  app.post<{ Body: Record<string, string> }>("/settings/network/channels/add", async (request, reply) => {
    const b = request.body ?? {};
    const category = CATEGORIES.find((c) => c.id === formText(b.category))?.id ?? "stories";
    const r = await addChannel({ name: formText(b.name), category, units: category === "bits" || category === "reading" ? 5 : null, colour: "" });
    if ("error" in r) return back(reply, { error: r.error }, "#addnet");
    const divisions = await listDivisions();
    const div = formText(b.division);
    await setChannelPlace(r.name, { divisionId: divisions.some((d) => d.id === div) ? div : category, active: true });
    const link = formText(b.link).slice(0, 300);
    if (link) await setChannelLink(r.name, link);
    return back(reply, { saved: `Added ${r.name}${link ? "; its YouTube channel is read within the hour" : ""}.` }, "#channels");
  });

  app.post<{ Body: Record<string, string> }>("/settings/network/rpm", async (request, reply) => {
    const b = request.body ?? {};
    const c = (await listNetChannels()).find((x) => x.id === formText(b.channel));
    const from = safeDate(formText(b.from));
    if (!c || !from) return back(reply, { error: "Pick a channel and a real date." }, "#rpm");
    const long = rpmValue(b.long), short = rpmValue(b.short), blended = rpmValue(b.blended);
    if (long === "bad" || short === "bad" || blended === "bad") return back(reply, { error: "An RPM is a number from 0 to 100, like 5.00 or 0.12." }, `#rpm-${c.id}`);
    if (long === null && short === null && blended === null) return back(reply, { error: "Set at least one RPM." }, `#rpm-${c.id}`);
    const currency = (CURRENCIES as readonly string[]).includes(formText(b.currency)) ? formText(b.currency) : "USD";
    await saveRpm({ channel: c.name, from, long, short, blended, currency, notes: formText(b.notes) });
    return back(reply, { saved: `${c.name}'s RPM saved from ${from}.` }, `#rpm-${c.id}`);
  });
  app.post<{ Params: { id: string } }>("/settings/network/rpm/:id/delete", async (request, reply) => {
    const id = Number(request.params.id);
    if (Number.isSafeInteger(id) && id > 0) await deleteRpm(id);
    return back(reply, { saved: "RPM entry deleted." }, "#rpm");
  });

}
