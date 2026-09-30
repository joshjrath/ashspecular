-- The daily posting check: did each video scheduled on a channel yesterday
-- actually go up? One row per channel per day checked, so a day is only ever
-- judged once; one row per video that didn't make it, with what the push
-- moved, so it can be put back.
ALTER TABLE records ADD COLUMN IF NOT EXISTS posted_video_id TEXT;

CREATE TABLE IF NOT EXISTS post_checks (
  channel    TEXT NOT NULL,
  day        DATE NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted     INTEGER NOT NULL DEFAULT 0,
  missed     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (channel, day)
);

CREATE TABLE IF NOT EXISTS missed_posts (
  id         BIGSERIAL PRIMARY KEY,
  record_id  BIGINT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL,
  day        DATE NOT NULL,          -- the day it was meant to post
  pushed_to  DATE NOT NULL,
  moved      INTEGER NOT NULL DEFAULT 0,   -- later videos on the channel that moved with it
  snapshot   JSONB NOT NULL,         -- MoveSnapshot[] as they were, for Undo
  undone_at  TIMESTAMPTZ,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (record_id, day)
);
CREATE INDEX IF NOT EXISTS missed_posts_at ON missed_posts (at DESC);
