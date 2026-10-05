-- Days the posting check wanted to judge a channel but couldn't read it
-- (quota out, YouTube down, a redeploy). Only these are caught up later; a
-- day the check never tried (history, a paused video, a date set by hand)
-- is never judged after the fact.
CREATE TABLE IF NOT EXISTS post_check_waits (
  channel  TEXT NOT NULL,
  day      DATE NOT NULL,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, day)
);
