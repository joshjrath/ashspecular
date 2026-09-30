-- The Bits Idea Feed: posts from sources (Tumblr tags first; later other
-- providers, or pasted in by hand) are stored as they're found, analysed, and
-- ranked for a person to save, reject or approve. Nothing here publishes or
-- sends anything into production on its own.

-- What to watch: a provider's search (a Tumblr tag), for one or more Bits channels.
CREATE TABLE IF NOT EXISTS idea_feeds (
  id              BIGSERIAL PRIMARY KEY,
  provider        TEXT NOT NULL DEFAULT 'tumblr',
  query           TEXT NOT NULL,                       -- the tag as typed: "ben 10"
  channels        TEXT[] NOT NULL DEFAULT '{}',        -- catalog names: "Specular Animation Bits"
  enabled         BOOLEAN NOT NULL DEFAULT true,
  weight          INTEGER NOT NULL DEFAULT 3 CHECK (weight BETWEEN 1 AND 5),
  exclusions      TEXT[] NOT NULL DEFAULT '{}',        -- words or tags that mark a post filtered
  min_notes       INTEGER NOT NULL DEFAULT 0,
  -- Where reading got to, kept only when a read succeeds: the newest post seen.
  cursor          JSONB NOT NULL DEFAULT '{}',
  poll_minutes    INTEGER NOT NULL DEFAULT 30,         -- how often it's read now (adapts to the tag's pace)
  next_poll_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error      TEXT,
  last_post_at    TIMESTAMPTZ,                         -- the newest post it has found
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idea_feeds_query ON idea_feeds (provider, lower(query));

-- Every post found: stored before anything judges it, so a better analysis
-- later can look at it again. The original link is always kept.
CREATE TABLE IF NOT EXISTS idea_sources (
  id              BIGSERIAL PRIMARY KEY,
  provider        TEXT NOT NULL,                       -- 'tumblr', 'manual' (later 'reddit', …)
  external_id     TEXT NOT NULL,                       -- the provider's own id for it
  url             TEXT NOT NULL DEFAULT '',            -- the original post
  author          TEXT,
  author_url      TEXT,
  posted_at       TIMESTAMPTZ,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  post_type       TEXT,                                -- text, photo, answer, quote, chat, link, video, audio, manual
  title           TEXT,
  body            TEXT NOT NULL DEFAULT '',            -- its words as plain text, reblog trail in order
  media           JSONB NOT NULL DEFAULT '[]',         -- [{ url, width, height, alt }]
  tags            TEXT[] NOT NULL DEFAULT '{}',
  notes           INTEGER,                             -- engagement, as read at engagement_at
  likes           INTEGER,
  reblogs         INTEGER,
  replies         INTEGER,
  engagement_at   TIMESTAMPTZ,
  root_key        TEXT,                                -- 'tumblr:<root post id>': every reblog of one post shares it
  is_reblog       BOOLEAN NOT NULL DEFAULT false,
  added_text      TEXT,                                -- what a reblog added of its own
  text_hash       TEXT,                                -- the words, normalised: the same text posted twice
  channels        TEXT[] NOT NULL DEFAULT '{}',        -- the channels of the feeds that found it
  discovered_via  TEXT NOT NULL DEFAULT 'feed',        -- 'feed' or 'manual'
  raw             JSONB,
  -- Where it is in the pipeline, and what's next for it.
  stage           TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'triaged', 'analyzed', 'filtered', 'error')),
  pending         TEXT CHECK (pending IN ('triage', 'full')),
  processing_at   TIMESTAMPTZ,
  attempts        INTEGER NOT NULL DEFAULT 0,
  filter_reason   TEXT,
  error           TEXT,
  duplicate_of    BIGINT REFERENCES idea_sources(id) ON DELETE SET NULL,
  -- The latest analysis, and what it says (kept here to rank and filter by).
  analysis_id     BIGINT,
  depth           TEXT CHECK (depth IN ('triage', 'full')),
  score           INTEGER,
  channel         TEXT,
  classification  TEXT,
  classification_manual BOOLEAN NOT NULL DEFAULT false,
  canon_check     BOOLEAN NOT NULL DEFAULT false,      -- canon claims to verify
  canon_verified_at TIMESTAMPTZ,
  similarity      REAL,                                -- recency-weighted, 0–1; null = not checked
  -- A person's call on it.
  decision        TEXT CHECK (decision IN ('saved', 'approved', 'rejected', 'used', 'archived')),
  decided_at      TIMESTAMPTZ,
  reject_reason   TEXT,
  reject_note     TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);
CREATE INDEX IF NOT EXISTS idea_sources_rank ON idea_sources (decision, score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idea_sources_ingested ON idea_sources (ingested_at DESC);
CREATE INDEX IF NOT EXISTS idea_sources_pending ON idea_sources (pending) WHERE pending IS NOT NULL;
CREATE INDEX IF NOT EXISTS idea_sources_root ON idea_sources (root_key);
CREATE INDEX IF NOT EXISTS idea_sources_hash ON idea_sources (text_hash);

-- Which feed found which post, and when.
CREATE TABLE IF NOT EXISTS idea_source_hits (
  source_id BIGINT NOT NULL REFERENCES idea_sources(id) ON DELETE CASCADE,
  feed_id   BIGINT NOT NULL REFERENCES idea_feeds(id) ON DELETE CASCADE,
  found_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, feed_id)
);
CREATE INDEX IF NOT EXISTS idea_source_hits_feed ON idea_source_hits (feed_id, found_at DESC);

-- Every analysis ever run, versioned, so any post can be re-scored later.
CREATE TABLE IF NOT EXISTS idea_analyses (
  id                BIGSERIAL PRIMARY KEY,
  source_id         BIGINT NOT NULL REFERENCES idea_sources(id) ON DELETE CASCADE,
  depth             TEXT NOT NULL CHECK (depth IN ('triage', 'full')),
  version           TEXT NOT NULL,                     -- the analysis logic: "bits-feed-1"
  model             TEXT,                              -- the model that answered
  result            JSONB,                             -- the AI's structured answer, as given
  score             INTEGER,
  breakdown         JSONB,                             -- how the score was reached
  similarity        JSONB,                             -- the history it resembled, with dates
  similarity_status TEXT NOT NULL DEFAULT 'none' CHECK (similarity_status IN ('ok', 'unavailable', 'none')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idea_analyses_source ON idea_analyses (source_id, created_at DESC);

-- An approved idea: what came of a source, linked to it for good, and on
-- through production to the published Short.
CREATE TABLE IF NOT EXISTS ideas (
  id               BIGSERIAL PRIMARY KEY,
  source_id        BIGINT REFERENCES idea_sources(id) ON DELETE SET NULL,
  analysis_id      BIGINT REFERENCES idea_analyses(id) ON DELETE SET NULL,
  channel          TEXT NOT NULL,
  title            TEXT NOT NULL,
  premise          TEXT NOT NULL DEFAULT '',
  direction        TEXT NOT NULL DEFAULT '',
  observation      TEXT NOT NULL DEFAULT '',
  classification   TEXT NOT NULL,
  canon_confidence REAL,
  canon_checks     TEXT[] NOT NULL DEFAULT '{}',
  canon_verified_at TIMESTAMPTZ,
  characters       TEXT[] NOT NULL DEFAULT '{}',
  franchises       TEXT[] NOT NULL DEFAULT '{}',
  comedy_engines   TEXT[] NOT NULL DEFAULT '{}',
  fingerprint      JSONB,                              -- characters, relationship, situation, engine, payoff
  similarity       JSONB,                              -- what it resembled when approved
  status           TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'approved', 'assigned', 'scripting', 'illustration', 'editing', 'scheduled', 'published', 'cancelled')),
  approved_at      TIMESTAMPTZ,
  approved_by      TEXT,
  batch_record_id  BIGINT REFERENCES records(id) ON DELETE SET NULL,
  batch_position   INTEGER,
  video_id         TEXT,                               -- the published Short, once linked
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ideas_status ON ideas (status, approved_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ideas_source ON ideas (source_id) WHERE source_id IS NOT NULL;

-- Every call a person made: save, reject (and why), approve, edits. What
-- recommendations can learn from later.
CREATE TABLE IF NOT EXISTS idea_decisions (
  id        BIGSERIAL PRIMARY KEY,
  source_id BIGINT REFERENCES idea_sources(id) ON DELETE CASCADE,
  idea_id   BIGINT REFERENCES ideas(id) ON DELETE CASCADE,
  action    TEXT NOT NULL,
  reason    TEXT,
  note      TEXT,
  detail    JSONB,
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idea_decisions_source ON idea_decisions (source_id, at DESC);

-- Spend, so the daily caps hold: provider calls and AI work per day.
CREATE TABLE IF NOT EXISTS idea_usage (
  day               DATE NOT NULL,
  kind              TEXT NOT NULL,                     -- 'tumblr', 'ai-triage', 'ai-full'
  calls             INTEGER NOT NULL DEFAULT 0,
  items             INTEGER NOT NULL DEFAULT 0,
  input_tokens      BIGINT NOT NULL DEFAULT 0,
  output_tokens     BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);

-- Settings changed on the page, not in code.
CREATE TABLE IF NOT EXISTS idea_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- The tags to start with, per Bits channel. Change them on the Sources page.
INSERT INTO idea_feeds (query, channels, weight) VALUES
  ('ben 10',                     '{"Specular Animation Bits"}', 3),
  ('avatar the last airbender',  '{"Specular Animation Bits"}', 3),
  ('teen titans',                '{"Specular Animation Bits"}', 3),
  ('jujutsu kaisen',             '{"Specular Anime Bits"}', 4),
  ('death note',                 '{"Specular Anime Bits"}', 3),
  ('naruto',                     '{"Specular Anime Bits"}', 3),
  ('pokemon',                    '{"Specular Pokemon Bits"}', 4),
  ('pokemon games',              '{"Specular Pokemon Bits"}', 2),
  ('undertale',                  '{"Specular Undertale Bits"}', 4),
  ('deltarune',                  '{"Specular Undertale Bits"}', 4),
  ('sonic the hedgehog',         '{"Specular Gaming Bits"}', 3),
  ('resident evil',              '{"Specular Gaming Bits"}', 3),
  ('marvel',                     '{"Specular Studios Bits"}', 3),
  ('dc comics',                  '{"Specular Studios Bits"}', 3),
  ('invincible',                 '{"Specular Studios Bits"}', 3),
  ('spider-man',                 '{"Specular Studios Bits"}', 3),
  ('fnaf',                       '{"Specular FNAF Bits"}', 4),
  ('five nights at freddys',     '{"Specular FNAF Bits"}', 3)
ON CONFLICT DO NOTHING;
