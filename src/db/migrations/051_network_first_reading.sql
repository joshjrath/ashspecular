-- The first reading of each day as well as the last, so a channel's first day
-- counts what it gained from its first reading on (there's no day before it).
ALTER TABLE network_channel_days ADD COLUMN IF NOT EXISTS first_views BIGINT;
ALTER TABLE network_channel_days ADD COLUMN IF NOT EXISTS first_subs BIGINT;
ALTER TABLE network_channel_days ADD COLUMN IF NOT EXISTS first_at TIMESTAMPTZ;

-- Days read before this: the reading kept is where the count starts.
UPDATE network_channel_days SET first_views = views, first_subs = subscribers, first_at = read_at WHERE first_at IS NULL;
