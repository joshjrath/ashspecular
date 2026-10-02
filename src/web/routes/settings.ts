/**
 * Settings: the page, and every form on it — sidebar and dashboard, time
 * estimates, API keys, limits, the login password, channel names and
 * colours, adding and removing channels.
 */
import { CATEGORIES, CHANNELS } from "../../catalog.js";
import { COMP_BOUNDS, compSetting, usageToday as compUsageToday, getCompSettings, saveCompSettings } from "../../db/competitors.js";
import { COOKIE_NAME, checkPassword, cookieOptions, issueToken, passwordChangedAt } from "../auth.js";
import { IDEA_BOUNDS, getSettings as getIdeaSettings, ideaSetting, usageOn as ideaUsageOn, saveSettings as saveIdeaSettings } from "../../db/ideas.js";
import { KEY_DEFS, LIMIT_DEFS, keyStates, keysInEffect, mask, setKey, setLimit, testKey, youtubeStatus } from "../../db/keys.js";
import { RAIL_ITEMS } from "../page.js";
import { TASK_CATEGORY } from "../../tasks/parse.js";
import { WORK_TYPES } from "../work.js";
import { addChannel, channelUse, listChannelSettings, removeChannel, renameChannel } from "../../db/channelsettings.js";
import { aiRunSummary } from "../../db/storylab.js";
import { colourSources, distinctColour, sampleAvatars, sampledChannels, setChannelColour } from "../../jobs/avatars.js";
import { config, hasDatabase } from "../../config.js";
import { dailyCap } from "../stories/brainstorm.js";
import { listOffShifted } from "../../db/records.js";
import { renderSettings } from "../pages/settings.js";
import { resetEstimates, saveEstimates } from "../../db/estimates.js";
import { saveBoardPassword } from "../../db/password.js";
import { cookieList, shell } from "../shell.js";
import type { FastifyInstance } from "fastify";

const keysView = (q: { key?: string; keymsg?: string; keyerr?: string }) => {
  const resting = new Map(youtubeStatus().map((y) => [y.masked, y.resting]));
  return {
    services: keyStates().map((st) => {
      const t = keyTests.get(st.def.id);
      const tests = t && Date.now() - t.at < 15 * 60_000 ? new Map(t.results.map((r) => [r.masked, r])) : null;
      return {
        id: st.def.id, label: st.def.label, what: st.def.what, where: st.def.where, many: Boolean(st.def.many), source: st.source, unreadable: st.unreadable,
        keys: st.masked.map((m) => ({ masked: m, resting: st.def.id === "youtube" ? resting.get(m) : false, test: tests?.get(m) })),
      };
    }),
    flash: q.key && q.keymsg ? { id: q.key, text: q.keymsg.slice(0, 200), error: q.keyerr === "1" } : undefined,
  };
};
const minMax = (b: { min: number; max: number }) => ({ min: b.min, max: b.max });
const limitsView = async (saved: boolean) => {
  const [story, idea, ideaUse, comp, compUse] = await Promise.all([aiRunSummary(), getIdeaSettings(), ideaUsageOn(), getCompSettings(), compUsageToday()]);
  return {
    saved,
    rows: [
      { group: "Story Lab", name: "story", label: "Claude calls a day", note: "Writing new ideas for each Stories channel", value: dailyCap(), ...minMax(LIMIT_DEFS.find((l) => l.id === "storylab")!), today: story.calls },
      { group: "Idea Feed", name: "triageCap", label: "Quick looks a day", note: "Claude's first read of each Tumblr post", value: idea.triageCap, ...minMax(IDEA_BOUNDS.triageCap), today: ideaUse.get("ai-triage")?.items ?? 0 },
      { group: "Idea Feed", name: "fullCap", label: "Full reads a day", note: "Claude's full analysis of the promising ones", value: idea.fullCap, ...minMax(IDEA_BOUNDS.fullCap), today: ideaUse.get("ai-full")?.items ?? 0 },
      { group: "Idea Feed", name: "tumblrDailyCap", label: "Tumblr calls a day", note: "Tumblr allows 5,000", value: idea.tumblrDailyCap, ...minMax(IDEA_BOUNDS.tumblrDailyCap), today: ideaUse.get("tumblr")?.calls ?? 0 },
      { group: "Competitors", name: "aiCalls", label: "Claude calls a day", note: "Reading concepts and the daily read", value: comp.aiCalls, ...minMax(COMP_BOUNDS.aiCalls), today: compUse.ai },
      { group: "Competitors", name: "quota", label: "YouTube quota units a day", note: "10,000 per key from Google", value: comp.quota, ...minMax(COMP_BOUNDS.quota), today: compUse.youtube },
    ],
  };
};

// API keys: save (replace), test, or remove one service's key. Takes effect straight away.
const keyTests = new Map<string, { at: number; results: Array<{ masked: string; ok: boolean; note: string }> }>();

export function registerSettings(app: FastifyInstance): void {
  // Settings: the sidebar's items, the dashboard's lists, the days off.
  // Time estimates: the one place every page counts time from. Blank is the default.
  app.post<{ Body: Record<string, string | undefined> }>("/settings/estimates", async (request, reply) => {
    const body = request.body ?? {};
    if (!hasDatabase) return reply.redirect("/settings#estimates");
    if (body.reset) {
      await resetEstimates();
    } else {
      const valid = new Set([
        ...WORK_TYPES.map((t) => `type:${t.id}`),
        ...CHANNELS.filter((c) => c.recurring).map((c) => `channel:${c.name}`),
        ...[...TASK_CATEGORY.keys()].map((k) => `task:${k}`),
      ]);
      const entries: Array<[string, number | null]> = [];
      for (const [field, raw] of Object.entries(body)) {
        if (!field.startsWith("e:") || !valid.has(field.slice(2))) continue;
        const n = Math.round(Number(raw));
        entries.push([field.slice(2), raw?.trim() && Number.isFinite(n) && n >= 1 ? Math.min(600, n) : null]);
      }
      await saveEstimates(entries);
    }
    return reply.redirect("/settings?estimates=saved#estimates");
  });
  app.post<{ Body: Record<string, string | undefined> }>("/settings/keys", async (request, reply) => {
    const b = request.body ?? {};
    const id = b.id ?? "";
    const def = KEY_DEFS.find((d) => d.id === id);
    const back = (text: string, error = false) =>
      reply.redirect(`/settings?${new URLSearchParams({ key: id, keymsg: text, ...(error ? { keyerr: "1" } : {}) }).toString()}#key-${id}`);
    if (!def) return reply.redirect("/settings#keys");
    if (!hasDatabase) return back("Keys can only be set here with the database connected — use Railway's variables.", true);
    const action = b.do ?? "save";
    if (action === "clear") {
      await setKey(id, null);
      keyTests.delete(id);
      const left = keysInEffect(id).length;
      return back(left ? "Removed. Railway's key is in use again." : "Removed. No key is set now.");
    }
    if (action === "test") {
      const keys = keysInEffect(id);
      if (!keys.length) return back("There's no key to test.", true);
      const results = await Promise.all(keys.slice(0, 10).map(async (k) => ({ masked: mask(k), ...(await testKey(id, k)) })));
      keyTests.set(id, { at: Date.now(), results });
      const bad = results.filter((r) => !r.ok).length;
      return back(bad ? `${bad} of ${results.length} didn't work.` : results.length > 1 ? `All ${results.length} work.` : "It works.", bad > 0);
    }
    const value = (b.value ?? "").trim();
    if (!value) return back("Paste a key first.", true);
    if (value.length > 4000 || /[^\x21-\x7e\s,]/.test(value)) return back("That doesn't look like a key.", true);
    await setKey(id, value);
    // Check it straight away, so a typo shows now rather than when a feature fails.
    const keys = keysInEffect(id);
    const results = await Promise.all(keys.slice(0, 10).map(async (k) => ({ masked: mask(k), ...(await testKey(id, k)) })));
    keyTests.set(id, { at: Date.now(), results });
    const bad = results.filter((r) => !r.ok).length;
    return back(bad ? `Saved, but ${bad === results.length && results.length === 1 ? "it" : `${bad} of ${results.length}`} didn't work — see below.` : "Saved and working. In use now.", bad > 0);
  });

  // Limits & spending: every daily cap, saved to wherever its feature reads it,
  // in the ranges each feature's own page allows (one table each).
  app.post<{ Body: Record<string, string | undefined> }>("/settings/limits", async (request, reply) => {
    const b = request.body ?? {};
    if (!hasDatabase) return reply.redirect("/settings#limits");
    const story = Number((b.story ?? "").trim());
    if ((b.story ?? "").trim() && Number.isFinite(story)) await setLimit("storylab", story);
    const idea = await getIdeaSettings();
    await saveIdeaSettings({
      ...idea,
      triageCap: Math.round(ideaSetting("triageCap", b.triageCap, idea.triageCap)),
      fullCap: Math.round(ideaSetting("fullCap", b.fullCap, idea.fullCap)),
      tumblrDailyCap: Math.round(ideaSetting("tumblrDailyCap", b.tumblrDailyCap, idea.tumblrDailyCap)),
    });
    const comp = await getCompSettings();
    await saveCompSettings({ ...comp, aiCalls: compSetting("aiCalls", b.aiCalls, comp.aiCalls), quota: compSetting("quota", b.quota, comp.quota) });
    return reply.redirect("/settings?limits=saved#limits");
  });

  // The login password: the current one, then the new one twice. Every other sign-in ends; this one carries on.
  app.post<{ Body: Record<string, string | undefined> }>("/settings/password", async (request, reply) => {
    const b = request.body ?? {};
    const fail = (why: string) => reply.redirect(`/settings?${new URLSearchParams({ pwerr: why }).toString()}#password`);
    if (!hasDatabase) return fail("The password can only be changed with the database connected.");
    if (!(await checkPassword(b.current ?? ""))) return fail("The current password isn't right.");
    const next = b.next ?? "";
    if (next.length < 8) return fail("The new password needs at least 8 characters.");
    if (next.length > 200) return fail("That's too long (200 characters at most).");
    if (next !== (b.again ?? "")) return fail("The two new passwords don't match.");
    if (await checkPassword(next)) return fail("That's the password already.");
    await saveBoardPassword(next);
    return reply.setCookie(COOKIE_NAME, issueToken(), cookieOptions(request.protocol === "https")).redirect("/settings?pw=changed#password");
  });

  app.get<{
    Querystring: { saved?: string; colours?: string; estimates?: string; chmsg?: string; cherr?: string; pw?: string; pwerr?: string; key?: string; keymsg?: string; keyerr?: string; limits?: string };
  }>("/settings", async (request, reply) => {
    const [s, shifted, sources, settings] = await Promise.all([shell("settings"), listOffShifted(), colourSources(), listChannelSettings().catch(() => [])]);
    const sampled = new Set(sampledChannels());
    // An added channel with nothing filed under it yet can be taken off again.
    const added = CHANNELS.filter((c) => settings.some((x) => x.id === c.id && x.added));
    const unused = new Set<string>();
    for (const c of added) {
      const use = await channelUse(c.name).catch(() => null);
      if (use && !use.records && !use.uploads) unused.add(c.id);
    }
    return reply.type("text/html").send(
      renderSettings(s, {
        railHide: s.railHide ?? [],
        dashHide: cookieList("dash_hide"),
        daysOff: s.daysOff ?? [],
        shifted: shifted.map((x) => x.record),
        saved: request.query.saved === "1",
        scripts: Boolean(s.scripts),
        colours: CHANNELS.map((c) => {
          const src = sources.get(c.name);
          const set = settings.find((x) => x.id === c.id);
          return {
            id: c.id, name: c.name, category: c.category, colour: c.color, source: src?.source ?? "catalog",
            sampled: sampled.has(c.name), linked: src?.linked ?? false, error: src?.error ?? null,
            previous: set?.previous ?? [], added: Boolean(set?.added), removable: unused.has(c.id), daily: c.recurring?.units ?? null,
          };
        }),
        newColour: distinctColour([...CHANNELS.map((c) => c.color), ...CATEGORIES.map((c) => c.color)]),
        estimatesSaved: request.query.estimates === "saved",
        password: { changedAt: passwordChangedAt(), saved: request.query.pw === "changed", error: (request.query.pwerr ?? "").slice(0, 200) },
        keys: hasDatabase ? keysView(request.query) : undefined,
        limits: hasDatabase ? await limitsView(request.query.limits === "saved").catch(() => undefined) : undefined,
        coloursSaved:
          request.query.chmsg ? request.query.chmsg.slice(0, 300) : request.query.colours === "saved" ? "Saved." : request.query.colours === "read" ? "Read the avatars again." : "",
        channelError: (request.query.cherr ?? "").slice(0, 300),
      }),
    );
  });

  // Channel colours: set by hand, reset to the avatar's (or the catalog's),
  // or read every Shorts avatar again now.
  app.post<{ Body: Record<string, string | undefined> }>("/settings/colours", async (request, reply) => {
    const body = request.body ?? {};
    // Names first: a renamed channel's colour is then saved under its new name.
    const renamed: string[] = [];
    const failed: string[] = [];
    for (const c of [...CHANNELS]) {
      const v = body[`n_${c.id}`];
      if (typeof v !== "string" || v.replace(/\s+/g, " ").trim() === c.name) continue;
      const r = await renameChannel(c.id, v);
      if ("error" in r) failed.push(r.error);
      else if (r.from !== r.name) renamed.push(`${r.from} is now ${r.name}`);
    }
    if (body.reset) {
      const c = CHANNELS.find((ch) => ch.id === body.reset);
      if (c) await setChannelColour(c.name, null);
      return reply.redirect("/settings?colours=saved#colours");
    }
    if (body.sample) {
      await sampleAvatars(fetch, true).catch((err) => console.error("[colours] sampling failed:", err));
      return reply.redirect("/settings?colours=read#colours");
    }
    for (const c of CHANNELS) {
      const v = body[`c_${c.id}`];
      if (v && /^#[0-9a-f]{6}$/i.test(v) && v.toUpperCase() !== c.color.toUpperCase()) await setChannelColour(c.name, v);
    }
    const q = new URLSearchParams({ colours: "saved" });
    if (renamed.length) q.set("chmsg", `${renamed.join("; ")} — everywhere on the board.`);
    if (failed.length) q.set("cherr", failed.join(" "));
    return reply.redirect(`/settings?${q.toString()}#colours`);
  });

  // A new channel, in the category picked: on every page, and the bot knows it, straight away.
  app.post<{ Body: Record<string, string | undefined> }>("/settings/channels/add", async (request, reply) => {
    const b = request.body ?? {};
    const units = b.units?.trim() ? Number(b.units) : null;
    const r = await addChannel({ name: b.name ?? "", category: b.category ?? "", units, colour: b.colour ?? "" });
    const q = new URLSearchParams("error" in r ? { cherr: r.error } : { chmsg: `Added ${r.name}.` });
    return reply.redirect(`/settings?${q.toString()}#colours`);
  });
  // Take an added channel off again, while nothing's been filed under it.
  app.post<{ Body: Record<string, string | undefined> }>("/settings/channels/remove", async (request, reply) => {
    const id = request.body?.remove ?? "";
    const name = CHANNELS.find((c) => c.id === id)?.name ?? "";
    const r = await removeChannel(id);
    const q = new URLSearchParams("error" in r ? { cherr: r.error } : { chmsg: `Took ${name} off the board.` });
    return reply.redirect(`/settings?${q.toString()}#colours`);
  });
  app.post<{ Body: { show?: string | string[]; dash?: string | string[] } }>("/settings", async (request, reply) => {
    const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
    const show = new Set(list(request.body?.show));
    const dash = new Set(list(request.body?.dash));
    const railHide = RAIL_ITEMS.map((i) => i.key).filter((k) => !show.has(k) && (k !== "scripts" || config.scriptsUrl || config.scriptsUrlRaw));
    const dashHide = ["revisions", "unsorted", "channels"].filter((k) => !dash.has(k));
    // Not httpOnly: the dashboard's own switches write dash_hide from the page.
    const keep = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365, httpOnly: false };
    reply.setCookie("rail_hide", railHide.join(".") || "none", keep);
    reply.setCookie("dash_hide", dashHide.join(".") || "none", keep);
    return reply.redirect("/settings?saved=1");
  });
}
