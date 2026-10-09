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
  /**
   * On the channel's first day of readings only: the day's first reading.
   * With no day before it, that day counts from here.
   */
  first?: { views: number | null; subscribers: number | null; at: Date } | null;
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

/** A channel's day as YouTube Analytics reports it (what YouTube Studio shows). */
export interface AnalyticsDay {
  channel: string;
  day: string;
  views: number;
  /** Null when YouTube didn't split the day by format. */
  viewsLong: number | null;
  viewsShort: number | null;
  subsGained: number | null;
  subsLost: number | null;
  /** YouTube's estimated revenue (USD); null when the sign-in can't see revenue. */
  revenue: number | null;
  revenueLong: number | null;
  revenueShort: number | null;
}

/** How far a connected channel's Analytics goes. */
export interface AnalyticsReach {
  /** The last day YouTube had figures for. */
  through: string | null;
  /** Whether the sign-in can see revenue. */
  revenue: boolean;
}
