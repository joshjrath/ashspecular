-- Network Overview: divisions, each channel's place in them, RPM assumptions
-- with effective dates, and the daily readings the analytics are built from.

-- Every upload gets its format (YouTube's own Shorts / long-form lists say
-- which) and whether it's the format the rest of the board measures that
-- channel on. The board's pages read only those; Network Overview reads both.
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS format TEXT CHECK (format IN ('long', 'short', 'unknown'));
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS board BOOLEAN NOT NULL DEFAULT true;
-- When `views` was read, so a gain is only counted against a recent reading.
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS views_at TIMESTAMPTZ;
UPDATE uploads SET format = CASE WHEN url LIKE '%/shorts/%' THEN 'short' ELSE 'long' END WHERE format IS NULL;
CREATE INDEX IF NOT EXISTS uploads_board ON uploads (channel, board, published_at DESC);

-- The other format's history, read once with a key.
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS other_backfilled_at TIMESTAMPTZ;

-- Divisions: analytics groups. The five start as the board's categories; more
-- can be added in Settings. The board's workflows keep using categories.
CREATE TABLE IF NOT EXISTS network_divisions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  colour     TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO network_divisions (id, name, colour, position) VALUES
  ('stories', 'Stories', '#4A5CD4', 0),
  ('gaming', 'Gaming', '#35986A', 1),
  ('reading', 'Reading', '#CE7118', 2),
  ('bits', 'Bits', '#AC63C8', 3),
  ('movies', 'Movies', '#A63F66', 4)
ON CONFLICT (id) DO NOTHING;

-- A channel's one primary division (so it's counted once), whether it's in
-- Network Overview, and its order. No row: its category's division, shown.
CREATE TABLE IF NOT EXISTS network_channels (
  channel     TEXT PRIMARY KEY,
  division_id TEXT REFERENCES network_divisions(id) ON DELETE SET NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  position    INTEGER,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RPM assumptions, each from a date on: the one in force on a day is the
-- latest that starts on or before it, so changing it never rewrites history.
CREATE TABLE IF NOT EXISTS network_rpm (
  id             BIGSERIAL PRIMARY KEY,
  channel        TEXT NOT NULL,
  effective_from DATE NOT NULL,
  long_rpm       NUMERIC(10, 4),
  short_rpm      NUMERIC(10, 4),
  blended_rpm    NUMERIC(10, 4),
  currency       TEXT NOT NULL DEFAULT 'USD',
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, effective_from)
);

-- A channel's public totals, the last reading of each day (ORG_TZ). A day's
-- views are its total less the day before's; a day missing is unknown, not 0.
CREATE TABLE IF NOT EXISTS network_channel_days (
  channel     TEXT NOT NULL,
  day         DATE NOT NULL,
  views       BIGINT,
  subscribers BIGINT,
  subs_hidden BOOLEAN NOT NULL DEFAULT false,
  videos      INTEGER,
  read_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, day)
);

-- Views gained by format, per channel per day: each video's rise between two
-- readings no more than 36 hours apart (a new video's first reading counts
-- whole). What the channel total gained beyond these is unclassified.
CREATE TABLE IF NOT EXISTS network_format_days (
  channel TEXT NOT NULL,
  day     DATE NOT NULL,
  format  TEXT NOT NULL CHECK (format IN ('long', 'short', 'unknown')),
  gained  BIGINT NOT NULL DEFAULT 0,
  videos  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (channel, day, format)
);

-- Alerts the daily network read found, shown in the bell.
CREATE TABLE IF NOT EXISTS network_alerts (
  key     TEXT PRIMARY KEY,
  kind    TEXT NOT NULL,
  channel TEXT,
  text    TEXT NOT NULL,
  href    TEXT,
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One read of every video's views a day (the hourly one covers sixty days).
CREATE TABLE IF NOT EXISTS network_reads (
  day     DATE PRIMARY KEY,
  at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  videos  INTEGER NOT NULL DEFAULT 0,
  error   TEXT
);
