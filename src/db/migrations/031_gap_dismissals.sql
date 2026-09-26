-- "Nothing assigned" days cleared by hand: the channel isn't posting that day
-- after all, so the dashboard, the calendar and the bell stop asking.
CREATE TABLE IF NOT EXISTS gap_dismissals (
  channel      TEXT NOT NULL,
  day          DATE NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, day)
);
