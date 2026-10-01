-- Competitors: channels tracked in niches (groups), their videos and views
-- over time, each video's concepts, the alerts worth raising, and a daily
-- AI read per niche. Competitor videos are kept apart from the board's own
-- uploads; a "my channel" already on the board reads its videos from there.
CREATE TABLE IF NOT EXISTS comp_groups (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS comp_groups_name ON comp_groups (lower(name));

CREATE TABLE IF NOT EXISTS comp_channels (
  id             BIGSERIAL PRIMARY KEY,
  group_id       BIGINT NOT NULL REFERENCES comp_groups(id) ON DELETE CASCADE,
  youtube_id     TEXT,                    -- UC…; null while a pasted link is resolved
  input          TEXT NOT NULL,           -- the link as pasted
  mine           BOOLEAN NOT NULL DEFAULT false,
  board_channel  TEXT,                    -- one of the board's channels: its videos come from Uploads
  title          TEXT,
  handle         TEXT,
  avatar_url     TEXT,
  subscribers    BIGINT,                  -- null when the channel hides it
  video_count    INTEGER,
  backfilled_at  TIMESTAMPTZ,
  refreshed_at   TIMESTAMPTZ,
  next_refresh_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comp_channels_group ON comp_channels (group_id);
CREATE UNIQUE INDEX IF NOT EXISTS comp_channels_unique ON comp_channels (group_id, youtube_id) WHERE youtube_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS comp_videos (
  video_id      TEXT PRIMARY KEY,
  youtube_id    TEXT NOT NULL,            -- its channel
  title         TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL,
  duration_s    INTEGER,
  is_short      BOOLEAN,
  thumbnail     TEXT,
  views         BIGINT,
  likes         BIGINT,
  comments      BIGINT,
  views_at      TIMESTAMPTZ,
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comp_videos_channel ON comp_videos (youtube_id, published_at DESC);

-- Views over time, for the same age-matched comparison the board's own videos get.
CREATE TABLE IF NOT EXISTS comp_video_views (
  video_id  TEXT NOT NULL REFERENCES comp_videos(video_id) ON DELETE CASCADE,
  at        TIMESTAMPTZ NOT NULL,
  views     BIGINT NOT NULL,
  PRIMARY KEY (video_id, at)
);

-- What each video is about, read once from its title: competitor videos,
-- my videos ("up:<id>" for one of the board's uploads) and planned ones ("rec:<id>").
CREATE TABLE IF NOT EXISTS comp_concepts (
  ref          TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  lead         TEXT,                      -- the main character, or the franchise when there isn't one
  other        TEXT,                      -- the other franchise, world, opponent or topic
  characters   TEXT[] NOT NULL DEFAULT '{}',
  franchises   TEXT[] NOT NULL DEFAULT '{}',
  format       TEXT,
  trend        TEXT,                      -- the broader pattern: "Marvel × Anime crossover"
  shape        TEXT,                      -- the title's structure
  source       TEXT NOT NULL,             -- 'ai' or 'rules'
  version      TEXT NOT NULL,
  read_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comp_alerts (
  id          BIGSERIAL PRIMARY KEY,
  group_id    BIGINT REFERENCES comp_groups(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,              -- outlier, gap, spread
  key         TEXT NOT NULL,              -- what it's about, so it's raised once
  text        TEXT NOT NULL,
  href        TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS comp_alerts_key ON comp_alerts (group_id, kind, key);

CREATE TABLE IF NOT EXISTS comp_reads (
  group_id    BIGINT NOT NULL REFERENCES comp_groups(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  facts       JSONB NOT NULL,
  notes       JSONB NOT NULL,
  model       TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, day)
);

CREATE TABLE IF NOT EXISTS comp_usage (
  day     DATE NOT NULL,
  kind    TEXT NOT NULL,                  -- youtube (quota units), ai
  units   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);

CREATE TABLE IF NOT EXISTS comp_settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
