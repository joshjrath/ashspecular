-- Daily bits batches carry a number that runs continuously per channel —
-- "FNAF Bits batch 141" is the 141st batch that channel has ever had, not the
-- 141st this month. Kept as its own column so the number survives a retitle.
ALTER TABLE records ADD COLUMN IF NOT EXISTS batch_no INTEGER;

CREATE INDEX IF NOT EXISTS records_batch_idx
  ON records (channel, batch_no DESC) WHERE batch_no IS NOT NULL;
