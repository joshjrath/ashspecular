/**
 * The Bits Idea Feed's routes: the feed and its card actions (save, reject,
 * approve, reclassify, analyse again), adding a post by hand, and Sources &
 * settings. Card actions answer a fetch with the card's new state, so the
 * page updates in place; without JavaScript they redirect back.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  FEED_TABS, ideaSetting, addFeed, approveSource, decide, deleteFeed, feedPulse, feedSources, getSettings, getSource, listFeeds, listIdeas, pollFeedNow,
  queueSources, reclassify, saveSettings, setIdeaStatus, sourcesInScope, tabCounts, updateFeed, usageOn, verifyCanon, forgetHistory,
  retryErrors, getIdea, type FeedTab, type IdeaSettings,
} from "../../db/ideas.js";
import { addManualSource, ideaTick, readerState } from "../../jobs/ideas.js";
import { canAnalyze } from "../../ideas/analyze.js";
import { modelFor } from "../../ai/claude.js";
import { tumblrKey } from "../../ideas/tumblr.js";
import { IDEA_STATUSES, REJECT_BY_ID, bitsChannels, isClassification } from "../../ideas/types.js";
import type { Shell } from "../page.js";
import { ideaCard, ideaRowCard, renderIdeaFeed, renderIdeaSources, type FeedQuery } from "./pages.js";

type Body = Record<string, string | string[] | undefined>;
const str = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "").trim();
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
const idOf = (v: unknown) => {
  const n = Number(str(v));
  return Number.isInteger(n) && n > 0 ? n : null;
};
const channelOf = (v: unknown) => {
  const c = str(v);
  return bitsChannels().includes(c) ? c : null;
};
/** Only ever send someone back to the feed. */
const safeBack = (v: unknown, fallback = "/ideas") => {
  const b = str(v);
  return /^\/ideas(\/|\?|#|$)/.test(b) ? b : fallback;
};
const wantsJson = (request: FastifyRequest) => request.headers["x-fetch"] === "1";

export function registerIdeaFeed(app: FastifyInstance, shell: (active: string) => Promise<Shell>): void {
  const html = (reply: FastifyReply, s: string) => reply.type("text/html").send(s);

  function feedQuery(q: Record<string, string | undefined>): FeedQuery {
    const tab = FEED_TABS.includes(q.tab as FeedTab) ? (q.tab as FeedTab) : "foryou";
    const min = Number(q.min);
    return {
      tab,
      channel: channelOf(q.ch),
      cls: isClassification(q.cls) ? q.cls! : null,
      canon: q.canon === "1",
      min: [50, 70, 85].includes(min) ? min : null,
      q: (q.q ?? "").trim().slice(0, 120),
      page: Math.max(0, Math.min(200, Math.floor(Number(q.page) || 0))),
    };
  }

  app.get<{ Querystring: Record<string, string | undefined> }>("/ideas", async (request, reply) => {
    const q = feedQuery(request.query);
    const src = idOf(request.query.src);
    const filter = { channel: q.channel, classification: q.cls, canon: q.canon, minScore: q.min, q: q.q || null };
    const [s, counts, pulse, feeds, settings, usage] = await Promise.all([shell("ideas"), tabCounts(filter), feedPulse(), listFeeds(), getSettings(), usageOn()]);
    let rows: Awaited<ReturnType<typeof feedSources>> = { rows: [], total: 0 };
    let ideas;
    if (src) {
      const one = await getSource(src);
      rows = { rows: one ? [one] : [], total: one ? 1 : 0 };
    } else if (q.tab === "approved") {
      ideas = await listIdeas({ channel: q.channel, statuses: IDEA_STATUSES.map((x) => x.id).filter((x) => x !== "published" && x !== "cancelled") });
    } else {
      rows = await feedSources({ tab: q.tab, ...filter, limit: 30, offset: q.page * 30 });
    }
    const enabled = feeds.filter((f) => f.enabled);
    const lastRead = enabled.map((f) => f.lastSuccessAt).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const reader = readerState();
    return html(
      reply,
      renderIdeaFeed(s, {
        query: src ? { ...q, tab: "new" } : q,
        rows: rows.rows,
        total: rows.total,
        counts,
        pulse,
        ideas,
        status: {
          tumblr: Boolean(tumblrKey()),
          ai: canAnalyze(),
          lastRead,
          feeds: enabled.length,
          failing: enabled.filter((f) => f.lastError).length,
          aiCapped: settings.ai && canAnalyze() && (usage.get("ai-full")?.items ?? 0) >= settings.fullCap,
          paused: reader.pausedUntil ? reader.reason : "",
        },
        flash: str(request.query.msg).slice(0, 300) || undefined,
        error: str(request.query.adderr).slice(0, 300) || undefined,
      }),
    );
  });

  /** A card action's answer: the card as it is now, or back where the form came from. */
  async function after(request: FastifyRequest<{ Body: Body }>, reply: FastifyReply, id: number, error?: string) {
    const back = safeBack(request.body?.back, "/ideas");
    if (wantsJson(request)) {
      if (error) return reply.send({ ok: false, error });
      const s = await getSource(id);
      return reply.send({ ok: true, html: s ? ideaCard(s, back) : "" });
    }
    return reply.redirect(`${back}${error ? `${back.includes("?") ? "&" : "?"}msg=${encodeURIComponent(error)}` : ""}#s-${id}`);
  }

  app.post<{ Params: { id: string; act: string }; Body: Body }>("/ideas/s/:id/:act", async (request, reply) => {
    const id = idOf(request.params.id);
    if (!id) return reply.code(404).send({ ok: false });
    const s = await getSource(id);
    if (!s) return reply.code(404).send({ ok: false });
    const b = request.body ?? {};
    switch (request.params.act) {
      case "save":
        await decide(id, "save");
        break;
      case "unsave":
      case "restore":
        await decide(id, request.params.act);
        break;
      case "reject": {
        const reason = str(b.reason);
        await decide(id, "reject", { reason: REJECT_BY_ID.has(reason) ? reason : "other", note: str(b.note).slice(0, 300) || null });
        forgetHistory();
        break;
      }
      case "analyze":
        await queueSources([id], "full");
        if (s.decision === "archived") await decide(id, "restore");
        void ideaTick();
        break;
      case "classify": {
        const c = str(b.classification);
        if (isClassification(c)) await reclassify(id, c);
        break;
      }
      case "canon":
        await verifyCanon(id, str(b.on) === "1");
        break;
      case "approve": {
        const r = (s.analysis?.depth === "full" ? s.analysis.result : null) ?? {};
        const title = (str(b.title) || String(r.suggested_title ?? "")).slice(0, 200);
        if (!title) return after(request, reply, id, "Give the idea a title first (or analyse the post fully for a suggestion).");
        const classification = str(b.classification) || s.classification || String(r.classification ?? "");
        await approveSource(id, {
          channel: channelOf(b.channel) ?? s.channel ?? s.channels[0] ?? bitsChannels()[0]!,
          title,
          premise: (b.title !== undefined ? str(b.premise) : String(r.suggested_premise ?? "")).slice(0, 2000),
          direction: (b.title !== undefined ? str(b.direction) : String(r.suggested_direction ?? "")).slice(0, 2000),
          classification: isClassification(classification) ? classification : "CANON_INSPIRED",
          notes: str(b.notes).slice(0, 500),
        });
        forgetHistory();
        break;
      }
      default:
        return reply.code(404).send({ ok: false });
    }
    return after(request, reply, id);
  });

  app.post<{ Params: { id: string }; Body: Body }>("/ideas/i/:id/status", async (request, reply) => {
    const id = idOf(request.params.id);
    const status = str(request.body?.status);
    if (id && IDEA_STATUSES.some((x) => x.id === status)) {
      await setIdeaStatus(id, status);
      forgetHistory();
    }
    if (wantsJson(request)) {
      const idea = id ? await getIdea(id) : null;
      // Published or cancelled leaves the Approved list.
      return reply.send({ ok: true, html: idea && idea.status !== "published" && idea.status !== "cancelled" ? ideaRowCard(idea) : "" });
    }
    return reply.redirect(safeBack(request.body?.back, "/ideas?tab=approved"));
  });

  app.post<{ Body: Body }>("/ideas/add", async (request, reply) => {
    const b = request.body ?? {};
    const r = await addManualSource({ url: str(b.url), text: str(b.text), channel: channelOf(b.channel) });
    if ("error" in r) return reply.redirect(`/ideas?tab=new&adderr=${encodeURIComponent(r.error)}`);
    void ideaTick();
    const msg = r.existed ? "That post was already in the feed — it's being read in full again." : "Added — it's being read in full now; this card fills in within a minute or two.";
    return reply.redirect(`/ideas?src=${r.id}&msg=${encodeURIComponent(msg)}`);
  });

  // ── Sources & settings ────────────────────────────────────────────────

  app.get<{ Querystring: { msg?: string } }>("/ideas/sources", async (request, reply) => {
    const [s, feeds, settings, usage] = await Promise.all([shell("ideas"), listFeeds(), getSettings(), usageOn()]);
    return html(
      reply,
      renderIdeaSources(s, {
        feeds, settings, usage, tumblr: Boolean(tumblrKey()), ai: canAnalyze(), model: modelFor("ideas"), reader: readerState(),
        flash: str(request.query.msg).slice(0, 300) || undefined,
      }),
    );
  });
  const toSources = (reply: FastifyReply, msg: string, anchor = "") => reply.redirect(`/ideas/sources?msg=${encodeURIComponent(msg)}${anchor}`);

  app.post<{ Body: Body }>("/ideas/sources/settings", async (request, reply) => {
    const b = request.body ?? {};
    const cur = await getSettings();
    const next: IdeaSettings = {
      polling: str(b.polling) === "on",
      ai: str(b.ai) === "on",
      triageCap: Math.round(ideaSetting("triageCap", str(b.triageCap), cur.triageCap)),
      fullCap: Math.round(ideaSetting("fullCap", str(b.fullCap), cur.fullCap)),
      fullThreshold: Math.round(ideaSetting("fullThreshold", str(b.fullThreshold), cur.fullThreshold) * 100) / 100,
      tumblrDailyCap: Math.round(ideaSetting("tumblrDailyCap", str(b.tumblrDailyCap), cur.tumblrDailyCap)),
    };
    await saveSettings(next);
    return toSources(reply, "Settings saved.", "#settings");
  });

  app.post<{ Body: Body }>("/ideas/sources/feed", async (request, reply) => {
    const b = request.body ?? {};
    const channels = list(b.channels).filter((c) => bitsChannels().includes(c));
    const id = await addFeed({ query: str(b.query), channels, weight: Number(str(b.weight)) || 3 });
    if (id) void ideaTick();
    return toSources(reply, id ? `Watching #${str(b.query).replace(/^#/, "")} — its first read is within a minute.` : "That tag is already watched (or was empty).", id ? `#f-${id}` : "");
  });

  app.post<{ Params: { id: string }; Body: Body }>("/ideas/sources/feed/:id", async (request, reply) => {
    const id = idOf(request.params.id);
    const b = request.body ?? {};
    if (id) {
      await updateFeed(id, {
        channels: list(b.channels).filter((c) => bitsChannels().includes(c)),
        enabled: str(b.enabled) === "on",
        weight: Number(str(b.weight)) || 3,
        exclusions: str(b.exclusions).split(",").map((x) => x.trim()).filter(Boolean),
        minNotes: Number(str(b.minNotes)) || 0,
      });
    }
    return toSources(reply, "Saved.", id ? `#f-${id}` : "");
  });
  app.post<{ Params: { id: string } }>("/ideas/sources/feed/:id/delete", async (request, reply) => {
    const id = idOf(request.params.id);
    if (id) await deleteFeed(id);
    return toSources(reply, "Tag removed. The posts it found stay in the feed.");
  });
  app.post<{ Params: { id: string } }>("/ideas/sources/feed/:id/poll", async (request, reply) => {
    const id = idOf(request.params.id);
    if (id) await pollFeedNow(id);
    void ideaTick();
    return toSources(reply, tumblrKey() ? "Reading it now — refresh in a moment." : "It's queued, but reading needs TUMBLR_API_KEY.", id ? `#f-${id}` : "");
  });

  app.post<{ Body: Body }>("/ideas/rescore", async (request, reply) => {
    const b = request.body ?? {};
    const scope = str(b.scope);
    const since = scope === "24h" ? new Date(Date.now() - 86_400_000) : scope === "7d" ? new Date(Date.now() - 7 * 86_400_000) : scope === "30d" ? new Date(Date.now() - 30 * 86_400_000) : null;
    const ids = await sourcesInScope({ since, channel: channelOf(b.channel), unusedOnly: scope === "unused" });
    const n = await queueSources(ids, str(b.depth) === "full" ? "full" : "triage");
    void ideaTick();
    return toSources(reply, n ? `Re-scoring ${n.toLocaleString("en-US")} post${n === 1 ? "" : "s"} with the current analysis — they update over the next minutes, within the daily caps.` : "No posts matched.", "#rescore");
  });
  app.post("/ideas/retry-errors", async (_request, reply) => {
    const n = await retryErrors();
    void ideaTick();
    return toSources(reply, n ? `Retrying ${n} failed analys${n === 1 ? "is" : "es"}.` : "Nothing failed.", "#rescore");
  });
}
