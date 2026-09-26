-- A Frame.io link is a cut to review. Work filed with one as anything other
-- than a revision (a forward the model read as an update, say) becomes a
-- revision, exactly as 023 set revisions up: no VO, no air date, a review
-- deadline twelve hours after it came in unless one was stated. The studio's
-- own assignment posts (a `MM-DD-YY | CODE | Title` heading) and the daily
-- batches stay as they are.
UPDATE records
SET kind = 'review', stage = 'review',
    air_date = NULL, vo_due = NULL, vo_source = 'none', script_due = NULL, word_count = NULL,
    deadline = COALESCE(deadline, created_at + interval '12 hours'),
    updated_at = now()
WHERE kind <> 'review'
  AND batch_no IS NULL
  AND links @> '[{"kind":"frameio"}]'::jsonb
  AND raw_content !~ '(^|\n)[#*_` ]*[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}[*_` ]*\|';

INSERT INTO nudges (record_id)
SELECT id FROM records
WHERE kind = 'review' AND status = 'open' AND deadline < now()
ON CONFLICT (record_id) DO NOTHING;
