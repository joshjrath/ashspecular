-- Thumbnails a Specular compilation reused: each source video's thumbnail is
-- used once, ever. Claimed by a compilation, or listed by hand (ones used
-- before the board kept track): compilation_id null.
CREATE TABLE IF NOT EXISTS compilation_thumbs (
  video_id       TEXT PRIMARY KEY,
  compilation_id BIGINT REFERENCES compilations(id) ON DELETE CASCADE,
  note           TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS compilation_thumbs_one ON compilation_thumbs (compilation_id) WHERE compilation_id IS NOT NULL;
