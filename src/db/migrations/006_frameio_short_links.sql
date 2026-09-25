-- f.io is Frame.io's share-link shortener, and the first parser only knew
-- frame.io, so short links were filed as an ordinary "other" link. This
-- reclassifies the ones already stored, so they appear under Revisions without
-- being posted again.
--
-- Only the host decides: f.io or any subdomain of it, never a lookalike.
UPDATE records
SET links = (
      SELECT jsonb_agg(
               CASE WHEN l->>'url' ~* '^https?://([a-z0-9-]+\.)*f\.io(/|$)'
                    THEN l || '{"kind":"frameio","label":"Frame.io review"}'::jsonb
                    ELSE l END)
      FROM jsonb_array_elements(links) AS l),
    -- A short link that was filed as nothing in particular is a revision.
    kind  = CASE WHEN kind = 'other' THEN 'review' ELSE kind END,
    stage = CASE WHEN kind = 'other' THEN 'review' ELSE stage END,
    updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(links) AS l
  WHERE l->>'url' ~* '^https?://([a-z0-9-]+\.)*f\.io(/|$)'
    AND l->>'kind' <> 'frameio'
);
