-- Story Lab: what each Stories channel is about, when set by hand (else it's
-- read from the channel's own videos), and ideas Claude has written for each
-- channel from its videos and how they did. Both keyed by the channel's id,
-- so a rename in Settings loses neither.
CREATE TABLE IF NOT EXISTS story_focus (
  channel_id  TEXT PRIMARY KEY,
  kind        TEXT,                   -- lead, hero, franchise, format, genre, or any; null: read it from its videos
  value       TEXT,
  note        TEXT,                   -- what the channel makes, in your words: Claude reads it
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_ai_ideas (
  id           BIGSERIAL PRIMARY KEY,
  channel_id   TEXT NOT NULL,
  title        TEXT NOT NULL,
  premise      TEXT NOT NULL DEFAULT '',
  beats        JSONB NOT NULL DEFAULT '[]',
  why          TEXT NOT NULL DEFAULT '',
  modelled_on  JSONB NOT NULL DEFAULT '[]',   -- the channel's own videos it builds on
  model        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  dropped_at   TIMESTAMPTZ,                   -- turned out to repeat a video, or no longer fits
  drop_reason  TEXT
);
CREATE INDEX IF NOT EXISTS lab_ai_ideas_channel ON lab_ai_ideas (channel_id, created_at DESC);

-- Each time Claude was asked, for the day's cap and the page's status line.
CREATE TABLE IF NOT EXISTS lab_ai_runs (
  id            BIGSERIAL PRIMARY KEY,
  channel_id    TEXT NOT NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok            BOOLEAN NOT NULL,
  error         TEXT,
  kept          INTEGER NOT NULL DEFAULT 0,
  dropped       INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS lab_ai_runs_at ON lab_ai_runs (at DESC);
