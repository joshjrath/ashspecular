/** One niche's data, put together for the pages and the jobs alike. */
import { getCompSettings, listChannels, listGroups, loadConcepts, loadVideos, plannedTitles, type CompChannel, type CompSettings, type Group } from "../db/competitors.js";
import { rowsOf, type Planned, type Row } from "./analysis.js";

export interface Niche {
  group: Group;
  channels: CompChannel[];
  rows: Row[];
  planned: Planned[];
  settings: CompSettings;
  now: Date;
}

export async function loadNiche(groupId: number, now = new Date()): Promise<Niche | null> {
  const group = (await listGroups()).find((g) => g.id === groupId);
  if (!group) return null;
  const [channels, settings] = await Promise.all([listChannels(groupId), getCompSettings()]);
  const videos = await loadVideos(channels);
  const boardMine = channels.filter((c) => c.mine && c.boardChannel).map((c) => c.boardChannel!);
  const plannedList = await plannedTitles(boardMine);
  const concepts = await loadConcepts([...videos.map((v) => v.videoId), ...plannedList.map((p) => p.ref)]);
  return {
    group, channels, settings, now,
    rows: rowsOf(videos, channels, concepts, now),
    planned: plannedList.map((p) => ({ ...p, concept: concepts.get(p.ref) ?? null })),
  };
}
