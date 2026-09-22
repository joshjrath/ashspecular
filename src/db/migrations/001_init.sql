-- Core intake table. One row per thing forwarded into Discord.
CREATE TABLE IF NOT EXISTS items (
  id              BIGSERIAL PRIMARY KEY,

  lane            TEXT        NOT NULL DEFAULT 'unknown',
  kind            TEXT        NOT NULL DEFAULT 'note',
  status          TEXT        NOT NULL DEFAULT 'inbox',

  title           TEXT        NOT NULL,
  summary         TEXT        NOT NULL DEFAULT '',
  project         TEXT,

  priority        SMALLINT    NOT NULL DEFAULT 3,
  due_at          TIMESTAMPTZ,
  vo_needed       BOOLEAN     NOT NULL DEFAULT FALSE,
  vo_due_at       TIMESTAMPTZ,

  links           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tags            TEXT[]      NOT NULL DEFAULT '{}',

  -- Provenance: everything needed to jump back to the original Discord message.
  source_guild_id   TEXT,
  source_channel_id TEXT,
  source_message_id TEXT UNIQUE,
  source_author     TEXT,
  source_url        TEXT,
  raw_content       TEXT      NOT NULL DEFAULT '',

  parsed_by       TEXT        NOT NULL DEFAULT 'llm',
  parse_model     TEXT,
  confidence      REAL        NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS items_lane_status_idx    ON items (lane, status);
CREATE INDEX IF NOT EXISTS items_due_idx            ON items (due_at) WHERE status IN ('inbox', 'active');
CREATE INDEX IF NOT EXISTS items_priority_idx       ON items (priority, due_at);
CREATE INDEX IF NOT EXISTS items_created_idx        ON items (created_at DESC);

-- Append-only activity log, so the dashboard can show "what changed" per item.
CREATE TABLE IF NOT EXISTS item_events (
  id          BIGSERIAL PRIMARY KEY,
  item_id     BIGINT      NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  event       TEXT        NOT NULL,
  detail      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  actor       TEXT        NOT NULL DEFAULT 'system',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS item_events_item_idx ON item_events (item_id, created_at DESC);

-- One row per posted daily digest, so a restart or a manual /digest does not double-post.
CREATE TABLE IF NOT EXISTS digests (
  id          BIGSERIAL PRIMARY KEY,
  local_date  DATE        NOT NULL UNIQUE,
  item_ids    BIGINT[]    NOT NULL DEFAULT '{}',
  message_url TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
