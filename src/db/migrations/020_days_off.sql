-- Days off. No work can be done on one, so a deadline that falls on it is due
-- at the same time on the last working day before it. The deadline as set is
-- never changed: un-mark the day and it's back as it was.
CREATE TABLE IF NOT EXISTS days_off (
  day DATE PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A deadline as it stands with days off taken into account, on the studio's
-- clock (America/New_York), keeping its time of day.
CREATE OR REPLACE FUNCTION off_adjusted(at TIMESTAMPTZ) RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN at IS NULL
      OR NOT EXISTS (SELECT 1 FROM days_off WHERE day = (at AT TIME ZONE 'America/New_York')::date)
      THEN at
    ELSE ((at AT TIME ZONE 'America/New_York') - make_interval(days => (
      SELECT MIN(n)::int FROM generate_series(1, 366) AS n
      WHERE NOT EXISTS (SELECT 1 FROM days_off WHERE day = (at AT TIME ZONE 'America/New_York')::date - n)
    ))) AT TIME ZONE 'America/New_York'
  END
$$;
