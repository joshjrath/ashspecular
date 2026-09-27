-- Tasks: anything forwarded into #tasks (or added on the site). Read by rules
-- into a title, category, priority, person and due date; every field can be
-- changed on the site. Snoozed ones come back on their own.
CREATE TABLE IF NOT EXISTS tasks (
  id                BIGSERIAL PRIMARY KEY,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT 'general',
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  person            TEXT,
  due               TIMESTAMPTZ,
  est_min           INTEGER,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  snoozed_until     TIMESTAMPTZ,
  source_url        TEXT,
  capture_url       TEXT,
  source_message_id TEXT UNIQUE,
  author            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tasks_open ON tasks (status, priority, due);

-- A timer can run on a task as well as on a record.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE;
