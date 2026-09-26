-- Uploaded: the video is live on its channel. Marking it also clears it; the
-- calendar shows it green.
ALTER TABLE records ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;
