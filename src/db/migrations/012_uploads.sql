-- The Uploads tracker. A Stories channel's YouTube link as it was pasted,
-- what it resolved to, and when it was last read.
CREATE TABLE IF NOT EXISTS youtube_channels (
  channel       TEXT PRIMARY KEY,           -- the catalog name, "Specular FNAF"
  input         TEXT NOT NULL,              -- the link as pasted
  youtube_id    TEXT,                       -- UC…, once resolved
  title         TEXT,                       -- the channel's own name on YouTube
  error         TEXT,                       -- why the last read failed, if it did
  checked_at    TIMESTAMPTZ,
  backfilled_at TIMESTAMPTZ,                -- when full history came in (API key only)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every long-form upload seen, kept for good: YouTube's free feed only ever
-- shows the latest fifteen, so the history is ours to keep.
CREATE TABLE IF NOT EXISTS uploads (
  video_id     TEXT PRIMARY KEY,
  channel      TEXT NOT NULL,
  title        TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  url          TEXT NOT NULL,
  views        BIGINT,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uploads_channel_published ON uploads (channel, published_at DESC);
