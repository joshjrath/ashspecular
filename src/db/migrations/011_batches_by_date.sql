-- Recurring batches lose their running numbers. A batch is its channel and
-- its air date: the title is the channel, there is no code, and batch_no is
-- only the marker that says "this is a recurring batch". The board adds the
-- air date wherever it shows one, so a moved batch never shows a stale date.
UPDATE records
SET title = channel, code = NULL, batch_no = 1
WHERE batch_no IS NOT NULL AND channel IS NOT NULL;
