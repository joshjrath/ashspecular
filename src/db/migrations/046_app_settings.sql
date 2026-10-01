-- Settings changed on the board rather than on Railway: API keys (encrypted)
-- and daily limits. A value here takes over from the server's variable of the
-- same name; clearing it goes back to that variable.
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  secret      BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
