-- One row per thing forwarded into Discord, in the shape derive() produces.
--
-- Every field the parser can fill has a column, and every field it could not
-- fill is NULL rather than a default that would read as fact. `vo_source`
-- records whether a voiceover time was stated or worked out from the air date,
-- so the board can show a derived deadline as a fallback, not a promise.
CREATE TABLE IF NOT EXISTS records (
  id                BIGSERIAL PRIMARY KEY,

  kind              TEXT        NOT NULL,
  category          TEXT        NOT NULL DEFAULT 'unknown',
  channel           TEXT,
  code              TEXT,
  title             TEXT,
  tag               TEXT,
  stage             TEXT,

  air_date          DATE,
  script_due        TIMESTAMPTZ,
  vo_due            TIMESTAMPTZ,
  vo_source         TEXT        NOT NULL DEFAULT 'none',
  deadline          TIMESTAMPTZ,

  word_count        INTEGER,
  assignee          TEXT,
  version           INTEGER,
  links             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  brief             TEXT,
  note              TEXT,

  -- 'open' until someone clears it. Nothing is ever deleted.
  status            TEXT        NOT NULL DEFAULT 'open',
  done_at           TIMESTAMPTZ,

  -- How it was read, so a wrong record can be traced back to the pass that
  -- made it: 'pattern' (no model), 'llm', or 'rule' (no model available).
  parsed_by         TEXT        NOT NULL DEFAULT 'pattern',
  confidence        REAL        NOT NULL DEFAULT 0,
  warnings          TEXT[]      NOT NULL DEFAULT '{}',

  -- Enough to jump back to the original message in Discord.
  source_message_id TEXT UNIQUE,
  source_channel_id TEXT,
  source_guild_id   TEXT,
  source_author     TEXT,
  source_url        TEXT,
  raw_content       TEXT        NOT NULL DEFAULT '',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS records_channel_idx  ON records (channel, status);
CREATE INDEX IF NOT EXISTS records_category_idx ON records (category, status);
CREATE INDEX IF NOT EXISTS records_vo_idx       ON records (vo_due) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS records_created_idx  ON records (created_at DESC);
