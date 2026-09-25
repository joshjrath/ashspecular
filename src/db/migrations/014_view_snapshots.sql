-- Views over time. The feed (or the API) gives a video's views *now*; to
-- compare a two-day-old video with last month's fairly, the board needs what
-- each video had at the same age, so every hourly read keeps a snapshot.
CREATE TABLE IF NOT EXISTS video_views (
  video_id TEXT NOT NULL REFERENCES uploads(video_id) ON DELETE CASCADE,
  at       TIMESTAMPTZ NOT NULL,
  views    BIGINT NOT NULL,
  PRIMARY KEY (video_id, at)
);

-- A breakout is announced once.
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS breakout_alerted_at TIMESTAMPTZ;
