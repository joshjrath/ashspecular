-- A day off takes its recurring work into account.
--
-- A daily batch can be worked on a day other than its own: a day off's
-- batches are done ahead on the working days before it, and a day opened
-- ahead on Recurring is worked today. Null: its own day, as before.
ALTER TABLE records ADD COLUMN IF NOT EXISTS work_day DATE;

-- A task due on a day off moves to a working day before it. Its due as it
-- was set, and the day off that moved it, so making the day a working day
-- again puts it back.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS off_from TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS off_day DATE;
