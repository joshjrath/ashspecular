-- What was said in each video, for reading Stories' scripts against how they
-- did. Filled by the hourly read from YouTube's own captions, or pasted in by
-- hand. A failed read is kept too (error, attempts) so it's retried slowly
-- rather than every hour.
CREATE TABLE IF NOT EXISTS transcripts (
  video_id   TEXT PRIMARY KEY REFERENCES uploads(video_id) ON DELETE CASCADE,
  source     TEXT,               -- 'youtube' or 'pasted'
  language   TEXT,
  auto       BOOLEAN,            -- YouTube's automatic captions
  segments   JSONB,              -- [{s: start seconds, d: duration, t: text}]
  text       TEXT,               -- the whole thing, plain, for searching
  features   JSONB,              -- the numbers the analysis reads (structure.ts)
  fetched_at TIMESTAMPTZ,
  error      TEXT,
  attempts   INT NOT NULL DEFAULT 0,
  tried_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS transcripts_missing ON transcripts (tried_at) WHERE segments IS NULL;
