/**
 * Uploads: each category's pace and performance, one channel on its own,
 * the YouTube links, and reading YouTube now.
 */
import { CHANNELS, type CategoryId } from "../../catalog.js";
import { type LabVideo, type PublicVideo, channelLab, labIdeas, norm as normTitle } from "../stories/lab.js";
import { type SeriesVideo, gamingSeries, nextUp } from "../gaming/series.js";
import { type SetFocus, channelProfile, focusBaseline } from "../stories/domain.js";
import { UPLOAD_CATEGORIES, UPLOAD_TARGETS, channelsIn, everyFor, perDayFor } from "../targets.js";
import { type Upload, listChannelLinks, listUploads, setChannelLink, syncUploads } from "../../jobs/youtube.js";
import { analyzeIdeas, checkIdea } from "../ideas.js";
import { announceBreakouts, loadVideoViews } from "../../jobs/breakouts.js";
import { boardOpenings, corpus } from "../stories/corpus.js";
import { cadenceFor, dailyFor } from "../cadence.js";
import { channelHealth, postingSlots, scoreShorts, typicalShort } from "../shorts-perf.js";
import { listFocus } from "../../db/storylab.js";
import { loadChannelColours, sampleAvatars } from "../../jobs/avatars.js";
import { renderUploads } from "../pages/uploads.js";
import { scoreAll, typicalViews } from "../performance.js";
import { refreshOwnPaces, requestCookies, shell } from "../shell.js";
import type { FastifyInstance } from "fastify";

/** Uploads as the series reader takes them, each with how it did against its channel's usual. */
function seriesVideos(uploads: Upload[], perf: Map<string, { multiple: number }>): SeriesVideo[] {
  return uploads.map((u) => ({ title: u.title, channel: u.channel, publishedAt: u.publishedAt, url: u.url, views: u.views, multiple: perf.get(u.videoId)?.multiple ?? null }));
}

// Uploads: whether each Stories channel is keeping to its four-day pace.
type UploadsQuery = { range?: string; cat?: string; idea?: string; ch?: string };
const uploadsPage = async (query: UploadsQuery) => {
  const category = (UPLOAD_CATEGORIES.find((c) => c.id === query.cat)?.id ?? "stories") as CategoryId;
  const target = UPLOAD_TARGETS[category];
  const ranges = target.kind === "daily" ? [14, 30, 60] : [30, 90, 180];
  const range = ranges.includes(Number(query.range)) ? Number(query.range) : ranges[1]!;
  // A paused channel is left out of the charts, unless asked for (Show paused).
  const s = await shell("uploads");
  const showPaused = requestCookies.getStore()?.uploads_paused === "show";
  const pausedHere = channelsIn(category).filter((c) => s.pausedChannels?.[c]);
  const channels = channelsIn(category).filter((c) => showPaused || !s.pausedChannels?.[c]);
  const now = new Date();
  const since = new Date(now.getTime() - (Math.max(range, 90) + 60) * 86_400_000);
  await refreshOwnPaces();
  const [links, allUploads, allViews, history] = await Promise.all([
    listChannelLinks(),
    listUploads(since),
    // A year and more of views, so every channel has twenty to compare with.
    // Twenty earlier videos to compare with: a year and more for long form,
    // a couple of months for Shorts at five a day.
    loadVideoViews(new Date(now.getTime() - (target.kind === "daily" ? 75 : 400) * 86_400_000), channels),
    // Gaming: every upload, so a series that's resting still shows.
    category === "gaming" ? listUploads(new Date(0)) : Promise.resolve(null),
  ]);
  const inCat = new Set(channels);
  const uploads = allUploads.filter((u) => inCat.has(u.channel));
  const viewData = allViews.filter((v) => inCat.has(v.channel));
  const cadence = channels.map((name) =>
    cadenceFor(name, uploads.filter((u) => u.channel === name).map((u) => u.publishedAt), now, everyFor(name) ?? 36_500),
  );
  const daily =
    target.kind === "daily"
      ? channels.map((name) => dailyFor(name, uploads.filter((u) => u.channel === name).map((u) => u.publishedAt), perDayFor(name), now))
      : undefined;
  const perf = scoreAll(viewData, now);
  const typical = new Map(
    channels.map((name) => {
      const mine = viewData.filter((v) => v.channel === name);
      return [name, target.kind === "daily" ? typicalShort(mine, now) : typicalViews(mine, now)] as const;
    }),
  );
  const byId = new Map(allUploads.map((u) => [u.videoId, u]));
  // Shorts get the fuller treatment: checkpoints from an hour, sixty to
  // compare with, a log-scale spread.
  const shortScores = target.kind === "daily" ? scoreShorts(viewData, now) : null;
  const multipleOf = (id: string) => shortScores?.get(id)?.multiple ?? perf.get(id)?.multiple ?? null;
  const ideaChannel = channels.includes(query.ch ?? "") ? query.ch! : null;
  const ideas = analyzeIdeas(
    viewData.filter((v) => !ideaChannel || v.channel === ideaChannel).map((v) => ({
      title: byId.get(v.videoId)?.title ?? "",
      channel: v.channel,
      publishedAt: v.publishedAt,
      url: byId.get(v.videoId)?.url ?? "",
      multiple: multipleOf(v.videoId),
    })).filter((v) => v.title),
    now,
  );
  const ideaTitle = (query.idea ?? "").trim().slice(0, 200);
  const series = history ? gamingSeries(seriesVideos(history.filter((u) => inCat.has(u.channel)), perf), now) : undefined;

  // Each video's opening, from its script, for the idea details.
  const openings = new Map([
    ...corpus()
      .filter((sc) => sc.sections[0]?.name === "INTRO")
      .map((sc) => [normTitle(sc.title), sc.sections[0]!.paras.join(" ")] as const),
    // Every category's scripts added on the board, not only Stories'.
    ...boardOpenings(),
  ]);
  const hooks = new Map(
    uploads.filter((u) => openings.has(normTitle(u.title))).map((u) => [u.url, openings.get(normTitle(u.title))!] as const),
  );

  return renderUploads(
      s,
      {
        channels, links, uploads, cadence, range, hasKey: Boolean(process.env.YOUTUBE_API_KEY?.trim()), perf, typical,
        category, daily, ideas, idea: ideaTitle ? { title: ideaTitle, check: checkIdea(ideaTitle, ideas) } : null,
        ideaChannel,
        shorts: shortScores
          ? {
              scores: shortScores,
              health: channels.map((c) => channelHealth(c, viewData, shortScores, now)),
              slots: postingSlots(viewData.filter((v) => now.getTime() - v.publishedAt.getTime() < 30 * 86_400_000), shortScores),
            }
          : undefined,
        hooks,
        series,
        paused: pausedHere.length ? { names: pausedHere, shown: showPaused } : undefined,
      },
      now,
    );
};

const backToCategory = (cat: unknown, ch?: unknown) => {
  const one = CHANNELS.find((c) => c.name === ch);
  return one ? `/uploads/channel/${one.id}` : `/uploads?cat=${UPLOAD_CATEGORIES.find((c) => c.id === cat)?.id ?? "stories"}`;
};

export function registerUploads(app: FastifyInstance): void {
  // Show or hide paused channels on the Uploads charts, remembered in this browser.
  app.get<{ Querystring: { show?: string; cat?: string } }>("/uploads/paused", async (request, reply) => {
    reply.setCookie("uploads_paused", request.query.show === "1" ? "show" : "hide", { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
    const cat = UPLOAD_CATEGORIES.find((c) => c.id === request.query.cat)?.id ?? "stories";
    return reply.redirect(`/uploads?cat=${cat}`);
  });

  app.get<{ Querystring: UploadsQuery }>("/uploads", async (request, reply) => {
    const shellHtml = await uploadsPage(request.query);
    return reply.type("text/html").send(shellHtml);
  });

  /**
   * One channel on its own: its pace, every video it has with how each did,
   * what stands out, and what to make next — the ideas from its own videos,
   * and for Stories, the Story Lab ideas that fit it.
   */
  app.get<{ Params: { id: string }; Querystring: { range?: string; idea?: string } }>(
    "/uploads/channel/:id",
    async (request, reply) => {
      const ch = CHANNELS.find((c) => c.id === request.params.id);
      if (!ch) return reply.redirect("/uploads");
      const category = ch.category;
      const target = UPLOAD_TARGETS[category];
      const ranges = target.kind === "daily" ? [14, 30, 60] : [30, 90, 180];
      const range = ranges.includes(Number(request.query.range)) ? Number(request.query.range) : ranges[1]!;
      const now = new Date();
      const name = ch.name;
      await refreshOwnPaces();
      const [s, links, everything, views] = await Promise.all([
        shell("uploads"),
        listChannelLinks(),
        listUploads(new Date(0)),
        // Long form: every video's curve. Shorts: four months — sixty to compare each with.
        loadVideoViews(new Date(target.kind === "daily" ? now.getTime() - 120 * 86_400_000 : 0), [name]),
      ]);
      const mine = everything.filter((u) => u.channel === name);
      const all = [...mine].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      const perf = scoreAll(views, now);
      const shortScores = target.kind === "daily" ? scoreShorts(views, now) : null;
      const typical = new Map([[name, target.kind === "daily" ? typicalShort(views, now) : typicalViews(views, now)] as const]);
      const byId = new Map(mine.map((u) => [u.videoId, u]));
      const multipleOf = (id: string) => shortScores?.get(id)?.multiple ?? perf.get(id)?.multiple ?? null;
      const ideas = analyzeIdeas(
        views
          .map((v) => ({ title: byId.get(v.videoId)?.title ?? "", channel: v.channel, publishedAt: v.publishedAt, url: byId.get(v.videoId)?.url ?? "", multiple: multipleOf(v.videoId) }))
          .filter((v) => v.title),
        now,
      );
      const ideaTitle = (request.query.idea ?? "").trim().slice(0, 200);

      // Stories: Story Lab's ideas, the ones that fit this channel first.
      let lab: Array<{ idea: import("../stories/lab.js").LabIdea; fit: string[] }> | undefined;
      if (category === "stories") {
        const storiesNames = channelsIn("stories");
        const storyViews = await loadVideoViews(new Date(0), storiesNames);
        const storyPerf = scoreAll(storyViews, now);
        const stories = everything.filter((u) => storiesNames.includes(u.channel));
        const videos: LabVideo[] = stories.map((u) => ({ title: u.title, multiple: storyPerf.get(u.videoId)?.multiple ?? null, publishedAt: u.publishedAt }));
        const published: PublicVideo[] = everything.map((u) => ({ title: u.title, url: u.url, channel: u.channel }));
        // Only ideas that fit the channel's focus: read from its videos, or set by hand in Story Lab.
        const set = (await listFocus().catch(() => new Map<string, SetFocus>())).get(ch.id) ?? null;
        const titles = mine.map((u) => u.title);
        lab = channelLab(name, titles, labIdeas(videos, now, 5000, published, [], false), 8, 2, channelProfile(name, titles, set, focusBaseline(stories.map((u) => u.title))));
      }
      // Gaming: its series, and the next episode of each worth making.
      const series = category === "gaming" ? gamingSeries(seriesVideos(mine, perf), now).series : undefined;

      return reply.type("text/html").send(
        renderUploads(
          s,
          {
            channels: [name], links, uploads: mine, cadence: [cadenceFor(name, mine.map((u) => u.publishedAt), now, everyFor(name) ?? 36_500)],
            range, hasKey: Boolean(process.env.YOUTUBE_API_KEY?.trim()), perf, typical, category,
            daily: target.kind === "daily" ? [dailyFor(name, mine.map((u) => u.publishedAt), perDayFor(name), now)] : undefined,
            ideas, idea: ideaTitle ? { title: ideaTitle, check: checkIdea(ideaTitle, ideas) } : null, ideaChannel: name,
            shorts: shortScores
              ? {
                  scores: shortScores,
                  health: [channelHealth(name, views, shortScores, now)],
                  slots: postingSlots(views.filter((v) => now.getTime() - v.publishedAt.getTime() < 30 * 86_400_000), shortScores),
                }
              : undefined,
            focus: { channel: name, all, lab, series, next: series ? nextUp(series, now) : undefined },
          },
          now,
        ),
      );
    },
  );

  app.post<{ Body: Record<string, string | undefined> }>("/uploads/links", async (request, reply) => {
    const body = request.body ?? {};
    for (const c of CHANNELS) {
      if (typeof body[c.name] === "string") await setChannelLink(c.name, body[c.name]!);
    }
    await syncUploads().catch((err) => console.error("[uploads] read failed:", err));
    await announceBreakouts().catch((err) => console.error("[uploads] breakout alert failed:", err));
    // A new Shorts link: its avatar's colour, straight away (and a removed one's goes).
    await sampleAvatars().catch((err) => console.error("[colours] sampling failed:", err));
    await loadChannelColours().catch((err) => console.error("[colours] load failed:", err));
    return reply.redirect(backToCategory(body._cat, body._ch));
  });

  app.post<{ Body: Record<string, string | undefined> }>("/uploads/check", async (request, reply) => {
    await syncUploads().catch((err) => console.error("[uploads] read failed:", err));
    await announceBreakouts().catch((err) => console.error("[uploads] breakout alert failed:", err));
    return reply.redirect(backToCategory(request.body?._cat, request.body?._ch));
  });
}
