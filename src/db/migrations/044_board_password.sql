-- The board's login password when it's changed in Settings: stored only as a
-- salted scrypt hash, and taking over from DASHBOARD_PASSWORD. Setting
-- DASHBOARD_PASSWORD_RESET=true on the server clears it, for a forgotten one.
CREATE TABLE IF NOT EXISTS board_password (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hash        TEXT NOT NULL,
  salt        TEXT NOT NULL,
  generation  TEXT NOT NULL,          -- changes with every new password: older sign-ins stop working
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
