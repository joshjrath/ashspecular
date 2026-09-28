-- A day off spreads its work: each piece due on it goes to its own working
-- day before it (one a day, balanced against what those days already hold,
-- most pressing first) instead of all landing on the day before. The
-- deadline as set is still never changed: un-mark the day and the moves go.
CREATE TABLE IF NOT EXISTS day_off_moves (
  record_id BIGINT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  day_off   DATE NOT NULL,
  day       DATE NOT NULL,
  PRIMARY KEY (record_id, day_off)
);

-- A deadline as it stands: moved to its spread day when its day is off and it
-- was spread, else to the working day before (off_adjusted), keeping its time.
CREATE OR REPLACE FUNCTION off_placed(rid BIGINT, at TIMESTAMPTZ) RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT (m.day + (at AT TIME ZONE 'America/New_York')::time) AT TIME ZONE 'America/New_York'
       FROM day_off_moves m JOIN days_off d ON d.day = m.day_off
      WHERE at IS NOT NULL AND m.record_id = rid AND m.day_off = (at AT TIME ZONE 'America/New_York')::date),
    off_adjusted(at))
$$;

-- Work logged done with no time tracked (someone else did it): "r12", "t5".
CREATE TABLE IF NOT EXISTS untracked_done (
  key TEXT PRIMARY KEY,
  at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
