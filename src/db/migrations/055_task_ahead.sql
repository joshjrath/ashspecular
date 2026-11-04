-- A repeating task's occurrence opened ahead with its day's batches on
-- Recurring: the day it's for. It's worked today (its due), and the task's
-- own repeat skips that day when it comes round. Null: an ordinary task.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ahead_for DATE;
