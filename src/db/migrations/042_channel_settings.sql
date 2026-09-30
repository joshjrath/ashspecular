-- Channels added in Settings, and new names for the catalog's own. A renamed
-- channel keeps its id; every row that stored its old name is moved to the new
-- one when it's renamed (db/channels.ts), and the old name stays here so the
-- bot still recognises it in a message.
CREATE TABLE IF NOT EXISTS channel_settings (
  id          TEXT PRIMARY KEY,                -- the catalog's id, or "u_…" for a channel added in Settings
  name        TEXT NOT NULL,                   -- what the board calls it now
  added       BOOLEAN NOT NULL DEFAULT false,  -- added in Settings, not one of the catalog's
  category    TEXT,                            -- an added channel's category
  colour      TEXT,                            -- an added channel's own colour; a hand-set one still wins
  units       INTEGER,                         -- an added Bits or Reading channel's uploads a day (its daily batch)
  previous    TEXT[] NOT NULL DEFAULT '{}',    -- names it had before
  renamed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS channel_settings_name ON channel_settings (lower(name));
