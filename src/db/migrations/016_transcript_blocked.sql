-- A read YouTube refused is the server's problem, not the video's: it's
-- retried the next hour rather than backed off like a video with no captions.
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false;
UPDATE transcripts SET blocked = true, attempts = 0
 WHERE segments IS NULL AND (error ILIKE '%bot%' OR error ILIKE '%refus%' OR error ILIKE '%rate-limit%' OR error ILIKE '%empty caption%');
