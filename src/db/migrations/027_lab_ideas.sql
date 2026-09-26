-- Story Lab's Write next, per channel: an idea rerolled away ('skip') stays
-- out of that channel's cards; one saved for later ('save') sits in the
-- channel's idea bucket with what it was when it was saved; the cards showing
-- ('show') stay put until they're rerolled, saved or done.
CREATE TABLE IF NOT EXISTS lab_idea_marks (
  channel   TEXT NOT NULL,
  key       TEXT NOT NULL,
  mark      TEXT NOT NULL CHECK (mark IN ('skip', 'save', 'show')),
  title     TEXT NOT NULL,
  format    TEXT NOT NULL,
  hero      TEXT,
  world     TEXT,
  power     TEXT,
  target    TEXT,
  shape     TEXT,
  score     INTEGER NOT NULL DEFAULT 0,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, key)
);
