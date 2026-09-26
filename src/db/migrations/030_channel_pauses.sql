-- Pause production on a whole channel. Its open work is paused like a single
-- video is (off every deadline, the late list, the calendar, the bell and the
-- nudges), marked as paused by its channel so resuming the channel resumes
-- exactly that and no more. Anything filed for a paused channel is paused as
-- it arrives, and a recurring channel opens no new daily batches.
CREATE TABLE IF NOT EXISTS channel_pauses (
  channel   TEXT PRIMARY KEY,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE records ADD COLUMN IF NOT EXISTS paused_by_channel BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION pause_with_channel() RETURNS trigger AS $$
BEGIN
  IF NEW.channel IS NOT NULL AND NEW.status = 'open' AND NEW.paused_at IS NULL
     AND EXISTS (SELECT 1 FROM channel_pauses WHERE channel = NEW.channel) THEN
    NEW.paused_at := now();
    NEW.paused_by_channel := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS records_pause_with_channel ON records;
CREATE TRIGGER records_pause_with_channel
  BEFORE INSERT OR UPDATE OF channel ON records
  FOR EACH ROW EXECUTE FUNCTION pause_with_channel();
