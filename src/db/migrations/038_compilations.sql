-- Specular compilations: a Movie every day on Specular (4-5 source videos,
-- 60-90+ minutes) and a Sleep marathon every 4 days on Specular Sleep (~4
-- hours). Sources come from the whole long-form catalog, forever; a source
-- can be reused, but no compilation shares more than two sources with an
-- earlier one of its kind.

-- How long each upload runs, and where that came from: YouTube (with an API
-- key), its script's word count, or typed in by hand.
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS duration_s INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS duration_source TEXT;

CREATE TABLE IF NOT EXISTS compilations (
  id              BIGSERIAL PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('movie', 'sleep')),
  number          INTEGER,
  title           TEXT NOT NULL,
  -- The umbrella idea, as a key: "hero-powers:spiderman", "sleep:jjk". Two
  -- compilations with the same key are the same concept.
  concept         TEXT NOT NULL DEFAULT '',
  slot_date       DATE,
  -- 'planned' (chosen in Story Lab), 'posted' (an upload on the channel —
  -- either one this made, or an older one read back from its title).
  status          TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'posted', 'discarded')),
  record_id       BIGINT REFERENCES records(id) ON DELETE SET NULL,
  upload_video_id TEXT REFERENCES uploads(video_id) ON DELETE SET NULL,
  -- Sources read from an older upload's title rather than chosen here.
  inferred        BOOLEAN NOT NULL DEFAULT false,
  -- The editor package: the order to play them in, an intro, a transition
  -- into each source after the first.
  play_order      JSONB,
  intro           TEXT,
  transitions     JSONB,
  package_note    TEXT,
  packaged_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (upload_video_id)
);
CREATE INDEX IF NOT EXISTS compilations_kind ON compilations (kind, status, slot_date);

CREATE TABLE IF NOT EXISTS compilation_sources (
  compilation_id BIGINT NOT NULL REFERENCES compilations(id) ON DELETE CASCADE,
  video_id       TEXT NOT NULL REFERENCES uploads(video_id) ON DELETE CASCADE,
  position       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (compilation_id, video_id)
);
CREATE INDEX IF NOT EXISTS compilation_sources_video ON compilation_sources (video_id);

-- Never selected, ever: by video, or by title for one not read in yet.
CREATE TABLE IF NOT EXISTS compilation_exclusions (
  id         BIGSERIAL PRIMARY KEY,
  video_id   TEXT,
  title      TEXT,
  reason     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO compilation_exclusions (title, reason)
SELECT 'What If Michael Afton Became Springtrap?', 'Demonetized'
WHERE NOT EXISTS (SELECT 1 FROM compilation_exclusions WHERE lower(title) = lower('What If Michael Afton Became Springtrap?'));

-- Picks rerolled away in Story Lab: they don't come back for a while.
CREATE TABLE IF NOT EXISTS compilation_skips (
  kind       TEXT NOT NULL,
  combo      TEXT NOT NULL,
  skipped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, combo)
);
