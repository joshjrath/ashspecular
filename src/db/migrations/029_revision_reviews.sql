-- Each revision's notes, summary and score out of 10 (see src/revisions/),
-- kept with the revision. `video` groups the versions of one video (its code,
-- or its title without the version) for the history's timeline.
CREATE TABLE IF NOT EXISTS revision_reviews (
  record_id     BIGINT PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
  channel       TEXT,
  video         TEXT NOT NULL,
  title         TEXT NOT NULL,
  version       INTEGER,
  versions      INTEGER NOT NULL DEFAULT 1,
  comments      JSONB NOT NULL DEFAULT '[]'::jsonb,
  source        TEXT NOT NULL DEFAULT 'pasted',
  summary       TEXT NOT NULL DEFAULT '',
  summary_by    TEXT NOT NULL DEFAULT 'rules',
  own_summary   TEXT,
  own_score     NUMERIC,
  auto_score    NUMERIC NOT NULL,
  score         NUMERIC NOT NULL,
  breakdown     JSONB NOT NULL DEFAULT '{}'::jsonb,
  summarized_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revision_reviews_channel ON revision_reviews (channel, summarized_at DESC);

-- A channel marked from the revision history: a flag (time to find a
-- different editor) or a trophy (a run of great cuts).
CREATE TABLE IF NOT EXISTS channel_marks (
  channel   TEXT PRIMARY KEY,
  mark      TEXT NOT NULL CHECK (mark IN ('flag', 'trophy')),
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
