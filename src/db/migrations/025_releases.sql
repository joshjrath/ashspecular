-- When each entry in src/web/changelog.ts was first live: the time its
-- "What's new" notification carries. Recorded once, at the first start of a
-- server that ships it.
CREATE TABLE IF NOT EXISTS releases (
  id      TEXT PRIMARY KEY,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
