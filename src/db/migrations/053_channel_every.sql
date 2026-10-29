-- A long-form channel's upload frequency set in Settings: every N days, 0 for
-- no target. Null keeps its category's own (Stories every four days, Gaming
-- its usual pace).
ALTER TABLE channel_settings ADD COLUMN IF NOT EXISTS every_days INTEGER;
