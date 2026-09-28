-- Finance: money in, money out, and who and what it's for.
--
-- Every page in Finance is a view of these same tables — nothing is kept twice.
-- A few rules the whole design leans on:
--
--  * Money is whole cents (BIGINT), US dollars.
--  * Channel is its own dimension, never a category: an expense is Editing AND
--    Specular Anime AND paid to an editor, all on one row.
--  * An expense's channels are its splits (weights). No split rows means
--    General / network-wide.
--  * Cost and cash are separate. amount_cents is what the work cost; whether
--    cash left the business is its status:
--        paid     cash left (on paid_on)
--        unpaid   owed, not paid yet
--        covered  drawn from an advance already paid — no new cash
--    An advance itself (is_advance) is cash out but not a cost: the cost is
--    counted as the covered work comes in, so nothing is counted twice.
--  * Income covers a period (period_start..period_end, inclusive). V1 enters
--    months; a week or a day is the same row with a shorter period, and every
--    report spreads a period across the months it touches by days.
--  * A person's pay model has a history (effective_from). Each piece of work
--    keeps a snapshot of the model it was worked out with, so changing a rate
--    never rewrites the past.

CREATE TABLE IF NOT EXISTS fin_companies (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  notes      TEXT NOT NULL DEFAULT '',
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_categories (
  id       TEXT PRIMARY KEY,
  label    TEXT NOT NULL,
  colour   TEXT NOT NULL DEFAULT '#94949E',
  sort     INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO fin_categories (id, label, colour, sort) VALUES
  ('editing', 'Editing', '#F2A79C', 10),
  ('scripts', 'Scripts', '#5B9BF0', 20),
  ('voiceover', 'Voice-over', '#4A5CD4', 30),
  ('thumbnails', 'Thumbnails', '#E8C547', 40),
  ('animation', 'Animation', '#C08CF0', 50),
  ('music', 'Music & SFX', '#4FC4B0', 60),
  ('software', 'Software & tools', '#7D8AF5', 70),
  ('equipment', 'Equipment', '#CE7118', 80),
  ('marketing', 'Marketing', '#E5534B', 90),
  ('admin', 'Admin & legal', '#A6A6B0', 100),
  ('fees', 'Fees & taxes', '#82828C', 110),
  ('other', 'Other', '#6E6E7A', 120)
ON CONFLICT (id) DO NOTHING;

-- Revenue streams. `platform` marks the ones an RPM is worked out from
-- (AdSense by default) — a sponsorship counts toward profit, never RPM.
CREATE TABLE IF NOT EXISTS fin_streams (
  id       TEXT PRIMARY KEY,
  label    TEXT NOT NULL,
  colour   TEXT NOT NULL DEFAULT '#94949E',
  platform BOOLEAN NOT NULL DEFAULT false,
  sort     INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO fin_streams (id, label, colour, platform, sort) VALUES
  ('adsense', 'YouTube AdSense', '#E5534B', true, 10),
  ('sponsorship', 'Sponsorships / Brand deals', '#E8C547', false, 20),
  ('streaming', 'Streaming', '#C08CF0', false, 30),
  ('affiliate', 'Affiliate', '#4FC4B0', false, 40),
  ('platform', 'Other platform revenue', '#5B9BF0', false, 50),
  ('other', 'Other income', '#94949E', false, 60)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS fin_methods (
  id       BIGSERIAL PRIMARY KEY,
  label    TEXT NOT NULL UNIQUE,
  archived BOOLEAN NOT NULL DEFAULT false
);

-- Which company a channel belongs to, so its income and costs default to it.
CREATE TABLE IF NOT EXISTS fin_channel_companies (
  channel    TEXT PRIMARY KEY,
  company_id BIGINT REFERENCES fin_companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fin_people (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A person's pay, over time. The one in force on a date is the latest
-- effective_from on or before it.
CREATE TABLE IF NOT EXISTS fin_pay_models (
  id             BIGSERIAL PRIMARY KEY,
  person_id      BIGINT NOT NULL REFERENCES fin_people(id) ON DELETE CASCADE,
  model          TEXT NOT NULL CHECK (model IN ('per_video', 'per_minute', 'tiered', 'retainer', 'salary', 'revenue_share', 'prepaid', 'manual')),
  params         JSONB NOT NULL DEFAULT '{}',
  effective_from DATE NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_pay_models_person ON fin_pay_models (person_id, effective_from DESC);

-- Subscriptions and other recurring costs (a retainer or salary is one with a
-- person). Each bill is posted as an ordinary expense when it falls due.
CREATE TABLE IF NOT EXISTS fin_recurring (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription', 'recurring')),
  vendor       TEXT NOT NULL,
  person_id    BIGINT REFERENCES fin_people(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  frequency    TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual')),
  next_bill    DATE,
  category_id  TEXT REFERENCES fin_categories(id) ON DELETE SET NULL,
  company_id   BIGINT REFERENCES fin_companies(id) ON DELETE SET NULL,
  method_id    BIGINT REFERENCES fin_methods(id) ON DELETE SET NULL,
  auto_post    BOOLEAN NOT NULL DEFAULT true,
  post_status  TEXT NOT NULL DEFAULT 'paid' CHECK (post_status IN ('paid', 'unpaid')),
  active       BOOLEAN NOT NULL DEFAULT true,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fin_recurring_splits (
  recurring_id BIGINT NOT NULL REFERENCES fin_recurring(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL,
  weight       NUMERIC NOT NULL CHECK (weight > 0),
  PRIMARY KEY (recurring_id, channel)
);

CREATE TABLE IF NOT EXISTS fin_expenses (
  id               BIGSERIAL PRIMARY KEY,
  amount_cents     BIGINT NOT NULL CHECK (amount_cents >= 0),
  date             DATE NOT NULL,
  payee            TEXT NOT NULL DEFAULT '',
  person_id        BIGINT REFERENCES fin_people(id) ON DELETE SET NULL,
  type             TEXT NOT NULL DEFAULT 'one_off' CHECK (type IN ('contractor', 'subscription', 'one_off', 'recurring', 'manual')),
  category_id      TEXT REFERENCES fin_categories(id) ON DELETE SET NULL,
  company_id       BIGINT REFERENCES fin_companies(id) ON DELETE SET NULL,
  method_id        BIGINT REFERENCES fin_methods(id) ON DELETE SET NULL,
  record_id        BIGINT REFERENCES records(id) ON DELETE SET NULL,
  recurring_id     BIGINT REFERENCES fin_recurring(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'unpaid', 'covered')),
  paid_on          DATE,
  is_advance       BOOLEAN NOT NULL DEFAULT false,
  -- Contractor work: what was done, what the model worked out, and the model itself.
  units_videos     NUMERIC,
  units_minutes    NUMERIC,
  calculated_cents BIGINT,
  pay_snapshot     JSONB,
  receipt_url      TEXT,
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recurring_id, date)
);
CREATE INDEX IF NOT EXISTS fin_expenses_date ON fin_expenses (date);
CREATE INDEX IF NOT EXISTS fin_expenses_person ON fin_expenses (person_id, date);
CREATE INDEX IF NOT EXISTS fin_expenses_status ON fin_expenses (status) WHERE status <> 'paid';

CREATE TABLE IF NOT EXISTS fin_expense_splits (
  expense_id BIGINT NOT NULL REFERENCES fin_expenses(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL,
  weight     NUMERIC NOT NULL CHECK (weight > 0),
  PRIMARY KEY (expense_id, channel)
);
CREATE INDEX IF NOT EXISTS fin_expense_splits_channel ON fin_expense_splits (channel);

CREATE TABLE IF NOT EXISTS fin_attachments (
  id         BIGSERIAL PRIMARY KEY,
  expense_id BIGINT NOT NULL REFERENCES fin_expenses(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_income (
  id           BIGSERIAL PRIMARY KEY,
  amount_cents BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  granularity  TEXT NOT NULL DEFAULT 'month' CHECK (granularity IN ('month', 'week', 'day', 'custom')),
  received_on  DATE,
  stream_id    TEXT NOT NULL REFERENCES fin_streams(id),
  source       TEXT NOT NULL DEFAULT '',
  channel      TEXT,
  company_id   BIGINT REFERENCES fin_companies(id) ON DELETE SET NULL,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS fin_income_period ON fin_income (period_start, period_end);
CREATE INDEX IF NOT EXISTS fin_income_channel ON fin_income (channel);

-- A channel's views for a period, as entered (from YouTube Studio). Where
-- there's none, the board estimates from its own view snapshots.
CREATE TABLE IF NOT EXISTS fin_channel_periods (
  channel      TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  granularity  TEXT NOT NULL DEFAULT 'month',
  views        BIGINT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, period_start, period_end)
);

-- Thresholds and anything else Finance Settings keeps.
CREATE TABLE IF NOT EXISTS fin_settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
