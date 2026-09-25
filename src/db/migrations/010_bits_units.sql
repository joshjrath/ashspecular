-- Bits count uploads like reading does, with a number per channel. Batches
-- already open take the new size; progress is kept, capped at the new size,
-- and a cleared batch stays cleared at its full count.
UPDATE records SET batch_target = CASE channel
    WHEN 'Specular Studios Bits'   THEN 5
    WHEN 'Specular Anime Bits'     THEN 5
    WHEN 'Specular FNAF Bits'      THEN 5
    WHEN 'Specular Animation Bits' THEN 5
    WHEN 'Specular Gaming Bits'    THEN 3
    WHEN 'Specular Undertale Bits' THEN 3
    WHEN 'Specular & Kay Bits'     THEN 1
  END
WHERE batch_no IS NOT NULL AND channel IN (
  'Specular Studios Bits', 'Specular Anime Bits', 'Specular FNAF Bits', 'Specular Animation Bits',
  'Specular Gaming Bits', 'Specular Undertale Bits', 'Specular & Kay Bits'
);

UPDATE records SET batch_done = CASE
    WHEN status = 'done' THEN batch_target
    ELSE LEAST(batch_done, batch_target)
  END
WHERE batch_no IS NOT NULL AND category = 'bits';
