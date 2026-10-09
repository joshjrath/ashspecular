/**
 * Network Overview's routes: the page and its exports, and Settings →
 * Network & revenue (divisions, channels, RPM assumptions).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CATEGORIES } from "../../catalog.js";
import { deleteAnalyticsLink, listAnalyticsLinks, markAnalyticsRead, saveAnalyticsLink } from "../../db/analytics.js";
import { addChannel } from "../../db/channelsettings.js";
import { googleClient, setGoogleClient } from "../../db/keys.js";
import {
  CURRENCIES, addDivision, deleteDivision, deleteRpm, firstReading, listDivisions, listNetChannels, listRpm, moveChannel, moveDivision, readStatus, readingCoverage,
  recentAlerts, renameDivision, rpmValue, saveRpm, setChannelPlace,
} from "../../db/network.js";
import { channelOfSignIn, exchangeCode, readAnalytics } from "../../jobs/analytics.js";
import { listChannelLinks, setChannelLink } from "../../jobs/youtube.js";
import { authUrl } from "../../network/analytics.js";
import { loadDataset } from "../../network/dataset.js";
import { EXPORTS, exportRows, type ExportKind } from "../../network/export.js";
import { buildOverview, readQuery } from "../../network/overview.js";
import { defaultPreset, periodOf } from "../../network/period.js";
import { ORG_TZ, dateIn, shiftDate } from "../../parse/derive.js";
import { cookieOptions } from "../auth.js";
import { baseUrlOf, formText, safeDate, toCsv } from "../http.js";
import { renderNetwork } from "../pages/network.js";
import { renderNetworkSettings } from "../pages/networksettings.js";
import { forgetPaces, shell } from "../shell.js";

/** Readings older than this are shown as stale. */
const STALE_HOURS = 3;

/** Where Google sends the browser back to: the address to add to the Google client. */
export const ANALYTICS_CALLBACK = "/settings/network/analytics/callback";
const redirectUriOf = (request: FastifyRequest) => `${baseUrlOf(request)}${ANALYTICS_CALLBACK}`;
/** Ties Google's answer to a Connect pressed on this board, for ten minutes. */
const STATE_COOKIE = "nt_oauth";

/** Read a newly connected channel's history in the background; a failure is kept on the connection and logged. */
function readInBackground(link: { youtubeId: string; channel: string | null }): void {
  void readAnalytics({ ...link, backfilled: false, through: null, revenue: null }).catch(async (err) => {
    const why = err instanceof Error ? err.message : String(err);
    console.error(`[analytics] first read of ${link.channel ?? link.youtubeId} failed:`, why);
    await markAnalyticsRead(link.youtubeId, { error: why }).catch((e) => console.error("[analytics] couldn't note the failure:", e));
  });
}

async function overviewFor(query: Record<string, unknown>, now: Date) {
  const [channels, divisions] = await Promise.all([listNetChannels(), listDivisions()]);
  const today = dateIn(ORG_TZ, now);
  const firstRead = await firstReading();
  const q = readQuery(query, { divisions: divisions.map((d) => d.id), channels: channels.map((c) => c.id) }, defaultPreset(firstRead, today));
  // Readings from the earliest day any section needs: the period's comparison, or two months for momentum.
  const rough = periodOf(q.preset, today, { from: q.from, to: q.to, firstDay: shiftDate(today, -1095), firstRead });
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
    const [s, divisions, channels, rpm, coverage, links, analytics] = await Promise.all([
      shell("settings"), listDivisions(), listNetChannels(), listRpm(), readingCoverage(), listChannelLinks(), listAnalyticsLinks(),
    ]);
    const client = googleClient();
    return html(reply, renderNetworkSettings(s, {
      divisions, channels, rpm, coverage, links: new Map(links.map((l) => [l.channel, l.input])), today: dateIn(ORG_TZ),
      analytics: { links: analytics, client: { source: client.source, id: client.id }, redirectUri: redirectUriOf(request) },
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

  // ── YouTube Analytics ────────────────────────────────────────────────────
  app.post<{ Body: Record<string, string> }>("/settings/network/analytics/client", async (request, reply) => {
    const b = request.body ?? {};
    if (b.clear === "1") {
      await setGoogleClient(null);
      return back(reply, { saved: "Google client removed." }, "#analytics");
    }
    const id = formText(b.id).slice(0, 300);
    const now = googleClient();
    // A blank secret keeps the one saved here, so the ID can be corrected alone.
    const secret = formText(b.secret).slice(0, 300) || (now.source === "settings" ? now.secret : "");
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) return back(reply, { error: "The client ID ends in .apps.googleusercontent.com: copy it from Google Cloud → Google Auth Platform → Clients." }, "#analytics");
    if (secret.length < 10) return back(reply, { error: "Paste the client secret too (it's beside the client ID in Google Cloud)." }, "#analytics");
    await setGoogleClient({ id, secret });
    return back(reply, { saved: "Google client saved. Now connect each channel." }, "#analytics");
  });

  app.post<{ Body: Record<string, string> }>("/settings/network/analytics/connect", async (request, reply) => {
    const client = googleClient();
    if (client.source === "none") return back(reply, { error: "Set the Google client ID and secret first." }, "#analytics");
    const channel = (await listNetChannels()).find((c) => c.id === formText(request.body?.channel));
    const state = randomBytes(24).toString("base64url");
    reply.setCookie(STATE_COOKIE, `${state}.${channel?.id ?? ""}`, { ...cookieOptions(request.protocol === "https"), path: "/settings/network/analytics", maxAge: 600 });
    // The one redirect off the board: Google's sign-in, built here, never from the request.
    return reply.redirect(authUrl({ clientId: client.id, redirectUri: redirectUriOf(request), state }));
  });

  // A GET that saves: Google sends the browser back here, and OAuth only does
  // GET. It only acts on the answer to a Connect pressed on this board (the
  // state cookie the POST above set), behind the sign-in like every route.
  app.get<{ Querystring: Record<string, string> }>(ANALYTICS_CALLBACK, async (request, reply) => {
    const q = request.query;
    const [state, channelId] = String(request.cookies[STATE_COOKIE] ?? "").split(".");
    reply.clearCookie(STATE_COOKIE, { path: "/settings/network/analytics" });
    if (q.error) return back(reply, { error: q.error === "access_denied" ? "Google sign-in was cancelled. Nothing changed." : "Google sign-in didn't finish. Try Connect again." }, "#analytics");
    const given = Buffer.from(formText(q.state));
    const expected = Buffer.from(state ?? "");
    if (!state || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return back(reply, { error: "That sign-in had expired or didn't start here. Press Connect again." }, "#analytics");
    }
    try {
      const tokens = await exchangeCode(formText(q.code), redirectUriOf(request));
      if (!tokens.refresh) return back(reply, { error: "Google didn't give lasting access. Press Connect again." }, "#analytics");
      const yt = await channelOfSignIn(tokens.access);
      if (!yt) return back(reply, { error: "That Google account has no YouTube channel. On Google's screen, pick the channel itself (its brand account), not your own name." }, "#analytics");
      const [channels, links] = await Promise.all([listNetChannels(), listChannelLinks()]);
      const picked = channels.find((c) => c.id === channelId);
      const owner = links.find((l) => l.youtubeId === yt.id);
      if (picked) {
        const pickedLink = links.find((l) => l.channel === picked.name);
        if (pickedLink?.youtubeId && pickedLink.youtubeId !== yt.id) {
          return back(reply, { error: `You signed in as ${yt.title}, which isn't ${picked.name}'s YouTube channel. Press Connect again and pick ${picked.name} on Google's screen.` }, "#analytics");
        }
        if (!pickedLink?.youtubeId && !owner) await setChannelLink(picked.name, `https://www.youtube.com/channel/${yt.id}`);
      } else if (!owner) {
        return back(reply, { error: `${yt.title} isn't linked to a channel on the board. Add its YouTube link under Channels first.` }, "#analytics");
      }
      await saveAnalyticsLink({ youtubeId: yt.id, title: yt.title, refreshToken: tokens.refresh, scopes: tokens.scope });
      readInBackground({ youtubeId: yt.id, channel: owner?.channel ?? picked?.name ?? null });
      return back(reply, { saved: `Connected ${yt.title}. Its history is loading; give it a minute, then open Network Overview.` }, "#analytics");
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      console.error("[analytics] connect failed:", why);
      return back(reply, { error: `Couldn't connect: ${why}.` }, "#analytics");
    }
  });

  app.post<{ Params: { id: string } }>("/settings/network/analytics/:id/read", async (request, reply) => {
    const link = (await listAnalyticsLinks()).find((l) => l.youtubeId === request.params.id);
    if (link) readInBackground(link);
    return back(reply, link ? { saved: `Reading ${link.title} again; give it a minute.` } : {}, "#analytics");
  });
  app.post<{ Params: { id: string } }>("/settings/network/analytics/:id/disconnect", async (request, reply) => {
    const link = (await listAnalyticsLinks()).find((l) => l.youtubeId === request.params.id);
    if (link) await deleteAnalyticsLink(link.youtubeId);
    return back(reply, link ? { saved: `Disconnected ${link.title}; its Analytics figures are gone from the board.` } : {}, "#analytics");
  });

}
