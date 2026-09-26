-- Specular Gaming Bits and Specular Undertale Bits go from three uploads a
-- day to five (Specular Pokemon Bits joins at five; its batches open on their
-- own). Batches still open for the current Bits day (3 AM to 3 AM Eastern) or
-- later take the new size; days already past keep the number they were set
-- at, so history stays true.
UPDATE records SET batch_target = 5, updated_at = now()
WHERE batch_no IS NOT NULL
  AND channel IN ('Specular Gaming Bits', 'Specular Undertale Bits')
  AND status = 'open'
  AND air_date >= ((now() - interval '3 hours') AT TIME ZONE 'America/New_York')::date;
