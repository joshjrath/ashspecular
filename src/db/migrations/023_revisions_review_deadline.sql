-- A revision is a new cut to review, not a video to voice. Revisions filed
-- before this carried a VO deadline worked out from an air date the message
-- mentioned; they get no VO and no air date (the video has those), and a
-- review deadline twelve hours after they were filed unless one was stated.
UPDATE records
SET air_date = NULL, vo_due = NULL, vo_source = 'none', script_due = NULL,
    deadline = COALESCE(deadline, created_at + interval '12 hours'),
    updated_at = now()
WHERE kind = 'review';

-- Ones already past that time are late on the board, but the Discord nudge
-- doesn't announce a backlog all at once for a rule that's only now arriving.
INSERT INTO nudges (record_id)
SELECT id FROM records
WHERE kind = 'review' AND status = 'open' AND deadline < now()
ON CONFLICT (record_id) DO NOTHING;
