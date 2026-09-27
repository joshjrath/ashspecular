-- Time tracked on a piece of work: a timer started and stopped, against the
-- work's estimate (My Day, the VO Queue's recording mode, Focus Mode). One
-- timer runs at a time; starting another stops it.
CREATE TABLE IF NOT EXISTS time_entries (
  id         SERIAL PRIMARY KEY,
  record_id  BIGINT REFERENCES records(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS time_entries_record ON time_entries (record_id);
CREATE INDEX IF NOT EXISTS time_entries_running ON time_entries (ended_at) WHERE ended_at IS NULL;
