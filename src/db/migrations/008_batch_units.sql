-- A batch can hold more than one upload: a reading channel's day is five,
-- ticked off one at a time. batch_target is how many, batch_done how many are
-- finished. A batch is cleared when the two meet.
ALTER TABLE records ADD COLUMN IF NOT EXISTS batch_target INTEGER;
ALTER TABLE records ADD COLUMN IF NOT EXISTS batch_done INTEGER NOT NULL DEFAULT 0;

UPDATE records SET batch_target = CASE WHEN category = 'reading' THEN 5 ELSE 1 END
WHERE batch_no IS NOT NULL AND batch_target IS NULL;

UPDATE records SET batch_done = batch_target
WHERE batch_no IS NOT NULL AND status = 'done';
