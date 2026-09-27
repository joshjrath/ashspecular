-- How long each kind of work takes Ash, set on the Settings page. One row per
-- estimate changed from its default: "type:reading", "channel:Specular DC",
-- "task:payment". No row means the default. Everything that counts time
-- (My Day, Focus, the VO Queue, the week's load, Tasks) reads these.
CREATE TABLE IF NOT EXISTS work_estimates (
  key        TEXT PRIMARY KEY,
  minutes    INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 600),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
