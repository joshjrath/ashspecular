-- One row per record we have already nudged about, so a deadline is announced
-- once rather than every time the check runs.
CREATE TABLE IF NOT EXISTS nudges (
  record_id  BIGINT PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
