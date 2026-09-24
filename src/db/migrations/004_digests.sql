-- One row per digest posted, so a restart on the same day cannot post twice.
CREATE TABLE IF NOT EXISTS digests (
  local_date DATE PRIMARY KEY,
  posted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
