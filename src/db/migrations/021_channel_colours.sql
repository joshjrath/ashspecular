-- Channel colours at runtime. A Shorts channel's colour is sampled from its
-- YouTube avatar (kept with its link); one set by hand in Settings wins over
-- the sample and the catalog alike.
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS avatar_colour TEXT;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS avatar_checked_at TIMESTAMPTZ;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS avatar_error TEXT;

CREATE TABLE IF NOT EXISTS channel_colours (
  channel    TEXT PRIMARY KEY,
  colour     TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
