-- Voice notes: what was said into a Finance tab's voice box, what was read
-- from it, and what was logged. An entry missing something it needs (an
-- amount, who) stays here as a draft to fill in; one that was logged but
-- guessed at something carries those fields in its row's `review`, so the
-- board can mark it until it's checked.
CREATE TABLE IF NOT EXISTS fin_voice_notes (
  id         BIGSERIAL PRIMARY KEY,
  tab        TEXT NOT NULL CHECK (tab IN ('income', 'expense', 'subscription', 'contractor')),
  transcript TEXT NOT NULL,
  entries    JSONB NOT NULL DEFAULT '[]',
  parsed_by  TEXT NOT NULL DEFAULT 'rules',
  dismissed  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_voice_notes_tab ON fin_voice_notes (tab, created_at DESC);

-- Fields a voice entry guessed at, until someone looks. Empty or null: nothing to check.
ALTER TABLE fin_expenses ADD COLUMN IF NOT EXISTS review TEXT[];
ALTER TABLE fin_income ADD COLUMN IF NOT EXISTS review TEXT[];
ALTER TABLE fin_recurring ADD COLUMN IF NOT EXISTS review TEXT[];
ALTER TABLE fin_expenses ADD COLUMN IF NOT EXISTS voice_id BIGINT REFERENCES fin_voice_notes(id) ON DELETE SET NULL;
ALTER TABLE fin_income ADD COLUMN IF NOT EXISTS voice_id BIGINT REFERENCES fin_voice_notes(id) ON DELETE SET NULL;
ALTER TABLE fin_recurring ADD COLUMN IF NOT EXISTS voice_id BIGINT REFERENCES fin_voice_notes(id) ON DELETE SET NULL;
