-- What's been added to Story Lab from its dice: a new format (title shape),
-- hero, world or setting, power, or target. The entries themselves live in
-- src/web/stories/dice.ts; this is only which ones are in.
CREATE TABLE IF NOT EXISTS lab_additions (
  kind     TEXT NOT NULL,
  id       TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);
