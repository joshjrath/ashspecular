-- Pause: a video taken out of the workflow. While paused it has no deadline
-- anywhere — off late, due today, the calendar, the columns, the bell and the
-- nudges — and sits on the Paused page until it's resumed, when its deadline
-- comes back as it was.
--
-- No script: the VO is needed but the script hasn't been sent. The card turns
-- a different colour until the script arrives.
ALTER TABLE records ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE records ADD COLUMN IF NOT EXISTS no_script_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS records_paused ON records (paused_at) WHERE paused_at IS NOT NULL;
