/**
 * The four sides of the business. `id` is what gets stored on every item, so
 * renaming a label is safe but renaming an id needs a data migration.
 */
export interface Lane {
  id: string;
  label: string;
  /** Hex used for the dashboard column and the Discord embed stripe. */
  color: string;
  /** Fed to the classifier so it knows what belongs where. */
  hint: string;
}

export const LANES: Lane[] = [
  {
    id: "shorts",
    label: "Shorts",
    color: "#f0803c",
    hint: "Short-form vertical video across the 5 shorts channels, ~25 shorts a day. Clip pulls, hooks, batch uploads, thumbnails for shorts.",
  },
  {
    id: "longform",
    label: "Long Form",
    color: "#4c8df6",
    hint: "Long-form YouTube videos: scripts, VO, edits, revisions, thumbnails, upload deadlines. This is the lane the daily priority digest reports on.",
  },
  {
    id: "gaming",
    label: "Gaming (Roblox / Minecraft)",
    color: "#3fbf7f",
    hint: "The Roblox and Minecraft gaming channels: gameplay capture, series episodes, anything naming Roblox or Minecraft specifically.",
  },
  {
    id: "bits",
    label: "Bits",
    color: "#b47cf0",
    hint: "The new Bits side of the business. Anything referencing 'bits' or that new venture.",
  },
];

export const LANE_IDS = LANES.map((l) => l.id);
export const UNKNOWN_LANE = "unknown";

export function lane(id: string): Lane {
  return (
    LANES.find((l) => l.id === id) ?? {
      id: UNKNOWN_LANE,
      label: "Unsorted",
      color: "#8b8b8b",
      hint: "",
    }
  );
}

export function laneColorInt(id: string): number {
  return parseInt(lane(id).color.slice(1), 16);
}
