-- Pinned records sit at the top of the dashboard, however many there are.
-- A timestamp rather than a flag, so the newest pin can come first.
ALTER TABLE records ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS records_pinned_idx ON records (pinned_at) WHERE pinned_at IS NOT NULL;
