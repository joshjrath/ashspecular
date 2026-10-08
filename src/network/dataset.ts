/**
 * Everything Network Overview reads, gathered once per page (or per alert
 * run): channels and divisions, RPM assumptions, the readings from a day on,
 * every upload, and the recent ones' outlier scores.
 */
import { firstReading, listDivisions, listNetChannels, listRpm, loadReadings, loadVideos } from "../db/network.js";
import { listSnapshots } from "../jobs/youtube.js";
import { ORG_TZ, dateIn } from "../parse/derive.js";
import { buildIndex, type Index } from "./compute.js";
import { scoreVideos, type VideoScore } from "./insights.js";
import type { Division, NetChannel, NetVideo, RpmRow } from "./types.js";

export interface Dataset {
  today: string;
  channels: NetChannel[];
  divisions: Division[];
  rpm: RpmRow[];
  ix: Index;
  videos: NetVideo[];
  scores: Map<string, VideoScore>;
  /** The first day any channel was read, or null before the first read. */
  firstRead: string | null;
}

/**
 * `from`: the first day readings are needed for (the day before is read too,
 * for its total). `scoreSince`: score uploads from this many days back (their
 * channels' earlier uploads are the baseline, so those come along).
 */
export async function loadDataset(o: { from: string; scoreSince: number; now?: Date }): Promise<Dataset> {
  const now = o.now ?? new Date();
  const [channels, divisions, rpm, firstRead] = await Promise.all([listNetChannels(), listDivisions(), listRpm(), firstReading()]);
  const names = channels.map((c) => c.name);
  const [readings, videos] = await Promise.all([loadReadings(names, o.from), loadVideos(names)]);
  const ix = buildIndex(readings.days, readings.formats, videos, rpm);
  // Snapshots only cover each video's first ten days; the last few months' are what scoring needs.
  const since = now.getTime() - (o.scoreSince + 90) * 86_400_000;
  const recent = videos.filter((v) => v.publishedAt.getTime() >= since);
  const snaps = await listSnapshots(recent.map((v) => v.videoId));
  const scores = scoreVideos(recent, snaps, now);
  return { today: dateIn(ORG_TZ, now), channels, divisions, rpm, ix, videos, scores, firstRead };
}
