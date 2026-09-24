-- One batch per channel per day, not five.
--
-- The first version opened five, which made 35 rows a day nobody would scroll.
-- This removes the surplus: auto-opened batches whose index is 2 or higher and
-- which nobody has touched. Anything already cleared is left alone, because a
-- cleared batch records work that actually happened.
DELETE FROM records
WHERE parsed_by = 'recurring'
  AND status = 'open'
  AND source_message_id ~ '^batch:[^:]+:[0-9]{4}-[0-9]{2}-[0-9]{2}:[2-9][0-9]*$';
