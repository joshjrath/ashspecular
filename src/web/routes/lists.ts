/**
 * Lists of records: search, removed, paused, the queue, late, one channel,
 * one category — and pausing or resuming a whole channel.
 */
import { CATEGORIES, CHANNELS } from "../../catalog.js";
import { SORTS, type SortDir, type SortKey, type SortState, renderCategory, renderList, renderPaused } from "../pages/lists.js";
import { channelCounts, listByCategory, listByChannel, listLate, listPaused, listRemoved, openByCategory, search } from "../../db/records.js";
import { channelPauseButton, channelPausedTag } from "../page.js";
import { esc } from "../html.js";
import { hasDatabase } from "../../config.js";
import { pauseChannel, resumeChannel } from "../../db/channels.js";
import { refererPath } from "../http.js";
import { reopenChannel } from "../../jobs/batches.js";
import { usDate } from "../../parse/derive.js";
import { forgetGaps, shell } from "../shell.js";
import type { FastifyInstance } from "fastify";

/**
 * The list sort: an explicit ?sort= wins and is remembered in a cookie, so
 * every list opens sorted the way you last chose. The links keep whatever
 * else the page's address carried — a search keeps its words.
 */
export function listSort(
  request: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
): SortState {
  const q = request.query as Record<string, string | undefined>;
  const [savedKey, savedDir] = (request.cookies.list_sort ?? "").split(":");
  const valid = (k: string | undefined): k is SortKey => SORTS.some((o) => o.key === k);
  const key: SortKey = valid(q.sort) ? q.sort : valid(savedKey) ? savedKey : "air";
  const dirRaw = valid(q.sort) ? q.dir : savedDir;
  const dir: SortDir = dirRaw === "desc" || dirRaw === "asc"
    ? dirRaw
    : SORTS.find((o) => o.key === key)!.defaultDir;
  if (valid(q.sort)) {
    reply.setCookie("list_sort", `${key}:${dir}`, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  }
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (k !== "sort" && k !== "dir" && v !== undefined) keep.set(k, v);
  const path = request.url.split("?")[0]!;
  const kept = keep.toString();
  return { key, dir, base: `${path}?${kept ? `${kept}&` : ""}` };
}

export function registerLists(app: FastifyInstance): void {
  app.get<{ Querystring: { q?: string } }>("/search", async (request, reply) => {
    const q = (request.query.q ?? "").trim();
    const s = await shell("");
    s.query = q;
    if (q.length < 2) {
      return reply
        .type("text/html")
        .send(renderList(s, "Search", "Type at least two characters.", []));
    }
    const list = await search(q);
    return reply
      .type("text/html")
      .send(renderList(s, `“${q}”`, `Nothing matches “${q}”.`, list, listSort(request, reply)));
  });

  // The old address keeps working for anything that already links to it.
  app.get("/reviews", async (_req, reply) => reply.redirect("/revisions"));

  app.get("/removed", async (request, reply) => {
    const [s, list] = await Promise.all([shell("removed"), listRemoved()]);
    return reply
      .type("text/html")
      .send(renderList(s, "Removed", "Nothing removed. Anything you take off the board lands here, to restore.", list, listSort(request, reply)));
  });

  app.get("/paused", async (_request, reply) => {
    const [s, list] = await Promise.all([shell("paused"), listPaused()]);
    return reply.type("text/html").send(renderPaused(s, list));
  });

  app.get("/queue", async (request, reply) => {
    const [s, grouped] = await Promise.all([shell("queue"), openByCategory()]);
    const all = CATEGORIES.flatMap((c) => grouped.get(c.id) ?? []).concat(
      grouped.get("unknown") ?? [],
    );
    return reply.type("text/html").send(renderList(s, "Queue", "Nothing open.", all, listSort(request, reply)));
  });

  // Everything past its time: where the chart's LATE column goes.
  app.get("/late", async (request, reply) => {
    const [s, list] = await Promise.all([shell("dashboard"), listLate()]);
    return reply
      .type("text/html")
      .send(renderList(s, "Late", "Nothing is late.", list, listSort(request, reply)));
  });

  // Pause production on a whole channel, or resume it.
  app.post<{ Params: { action: string }; Body: { channel?: string } }>("/channels/:action", async (request, reply) => {
    const channel = CHANNELS.find((c) => c.name === request.body?.channel)?.name;
    const { action } = request.params;
    if (hasDatabase && channel && (action === "pause" || action === "resume")) {
      if (action === "pause") await pauseChannel(channel);
      else {
        await resumeChannel(channel);
        await reopenChannel(channel);
      }
      forgetGaps();
    }
    return reply.redirect(refererPath(request.headers.referer, channel ? `/channel/${encodeURIComponent(channel)}` : "/"));
  });

  app.get<{ Params: { name: string } }>("/channel/:name", async (request, reply) => {
    const name = decodeURIComponent(request.params.name);
    const known = CHANNELS.find((c) => c.name === name);
    const [s, list] = await Promise.all([shell(known?.category ?? ""), listByChannel(name)]);
    const since = s.pausedChannels?.[name];
    return reply.type("text/html").send(
      renderList(
        s, name, `Nothing filed under ${name} yet.`, list, listSort(request, reply),
        known ? channelPauseButton(s, name) : "",
        since
          ? `<div class="pausedlead">${channelPausedTag(s, name)}Production on ${esc(name)} is paused since ${esc(usDate(since))}: its work is off every deadline, the calendar and the bell${known?.recurring ? ", and no daily batches open" : ""}.</div>`
          : "",
      ),
    );
  });

  app.get<{ Params: { id: string } }>("/category/:id", async (request, reply) => {
    const cat = CATEGORIES.find((c) => c.id === request.params.id);
    const s = await shell(cat?.id ?? "");
    if (!cat) return reply.code(404).type("text/html").send(renderList(s, "Not found", "No such category.", []));
    const [list, channels] = await Promise.all([listByCategory(cat.id), channelCounts()]);
    return reply.type("text/html").send(renderCategory(s, cat.label, cat.id, list, channels, listSort(request, reply)));
  });
}
