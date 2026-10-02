-- One timer runs at a time. Starting one used to stop the last in two
-- separate steps, so a double click could leave two running. Any older ones
-- still running are stopped where the newest started, then the database
-- holds the rule itself.
UPDATE time_entries t
   SET ended_at = GREATEST(t.started_at, newest.started_at)
  FROM (SELECT id, started_at FROM time_entries WHERE ended_at IS NULL ORDER BY started_at DESC, id DESC LIMIT 1) newest
 WHERE t.ended_at IS NULL AND t.id <> newest.id;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_running ON time_entries ((ended_at IS NULL)) WHERE ended_at IS NULL;
