/** Network Overview's shapes: what's stored, and what the page is built from. */
import type { CategoryId } from "../catalog.js";

export type VideoFormat = "long" | "short" | "unknown";
export type FormatPick = "all" | "long" | "short";

export interface Division {
  id: string;
  name: string;
  colour: string;
  position: number;
}

export interface NetChannel {
  id: string;
  name: string;
  category: CategoryId;
  /** Its one primary division; null when the one it was in has gone. */
  divisionId: string | null;
  /** Counted in Network Overview. */
  active: boolean;
  position: number;
  addedAt: Date | null;
  youtubeId: string | null;
  title: string | null;
  avatarUrl: string | null;
  /** Why the last YouTube read failed, if it did. */
  error: string | null;
  checkedAt: Date | null;
  colour: string;
}

export interface RpmRow {
  id: number;
  channel: string;
  /** In force from this day until the next row's. */
  from: string;
  long: number | null;
  short: number | null;
  blended: number | null;
  currency: string;
  notes: string;
  createdAt: Date;
}

/** A channel's public totals as last read on a day. */
export interface ChannelDay {
  channel: string;
  day: string;
  views: number | null;
  /** Null when hidden or not read. */
  subscribers: number | null;
  subsHidden: boolean;
  videos: number | null;
  readAt: Date;
}

/** Views a channel's videos of one format gained on a day. */
export interface FormatDay {
  channel: string;
  day: string;
  format: VideoFormat;
  gained: number;
  videos: number;
}

export interface NetVideo {
  videoId: string;
  channel: string;
  title: string;
  publishedAt: Date;
  url: string;
  views: number | null;
  format: VideoFormat;
  board: boolean;
}
