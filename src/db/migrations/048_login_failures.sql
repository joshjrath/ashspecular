-- Wrong passwords, kept so the sign-in slow-down (web/auth.ts) survives a
-- restart or a deploy. Only the last fifteen minutes matter; older rows are
-- pruned as new ones come in.
CREATE TABLE IF NOT EXISTS login_failures (
  ip  TEXT NOT NULL,
  at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_failures_at ON login_failures (at);
