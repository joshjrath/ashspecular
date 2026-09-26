-- Scripts pasted in, or read from a Google Doc, and kept with a video (or on
-- their own, from Story Lab). Stories scripts and standalone ones join the
-- corpus Story Lab learns from; every script's opening feeds the Uploads
-- idea hooks.
CREATE TABLE IF NOT EXISTS scripts (
  id         SERIAL PRIMARY KEY,
  record_id  BIGINT REFERENCES records(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  url        TEXT,
  words      INTEGER NOT NULL DEFAULT 0,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scripts_record_idx ON scripts (record_id);
