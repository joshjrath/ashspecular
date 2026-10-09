-- YouTube Analytics: a channel's own figures, the ones YouTube Studio shows,
-- read by signing in to Google as someone who manages the channel. Keyed by
-- the YouTube channel id, not the board's name, so a rename changes nothing.
CREATE TABLE IF NOT EXISTS network_analytics_links (
  youtube_id     TEXT PRIMARY KEY,
  title          TEXT NOT NULL DEFAULT '',
  -- Sealed (AES-256-GCM, keyed from SESSION_SECRET), like the API keys.
  refresh_token  TEXT NOT NULL,
  scopes         TEXT NOT NULL DEFAULT '',
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at      TIMESTAMPTZ,
  -- The last day YouTube had figures for (it runs two or three days behind).
  synced_through DATE,
  backfilled     BOOLEAN NOT NULL DEFAULT false,
  -- Whether the sign-in can see revenue: null until the first read says.
  revenue        BOOLEAN,
  error          TEXT
);

-- One row per channel per day, as YouTube Analytics reports it. A format's
-- figures are null when YouTube didn't split them.
CREATE TABLE IF NOT EXISTS network_analytics_days (
  youtube_id    TEXT NOT NULL,
  day           DATE NOT NULL,
  views         BIGINT NOT NULL,
  views_long    BIGINT,
  views_short   BIGINT,
  subs_gained   BIGINT,
  subs_lost     BIGINT,
  revenue       NUMERIC(14, 4),
  revenue_long  NUMERIC(14, 4),
  revenue_short NUMERIC(14, 4),
  PRIMARY KEY (youtube_id, day)
);
