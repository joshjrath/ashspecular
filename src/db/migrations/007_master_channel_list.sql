-- The studio's master channel list.

-- Long Form is now Stories.
UPDATE records SET category = 'stories', updated_at = now() WHERE category = 'long_form';

-- Bits channels now carry the Specular prefix. Auto-opened batch titles follow,
-- and because the batch counter reads MAX(batch_no) by channel name, renaming
-- the rows is what lets the numbering carry on rather than restart at 1.
UPDATE records
SET channel = 'Specular ' || channel,
    title = CASE WHEN batch_no IS NOT NULL AND title LIKE channel || ' batch %'
                 THEN 'Specular ' || title ELSE title END,
    updated_at = now()
WHERE channel IN ('Studios Bits', 'Anime Bits', 'FNAF Bits', 'Animation Bits',
                  'Gaming Bits', 'Undertale Bits');

UPDATE records
SET channel = 'Specular & Kay Bits',
    title = replace(title, 'NK Bits', 'Specular & Kay Bits'),
    updated_at = now()
WHERE channel = 'NK Bits';

-- Specular Gaming is now Specular Minecraft and Specular Roblox. Where the
-- message itself says which, use it; where it doesn't, the record keeps its
-- Gaming category and loses the channel rather than being guessed into one.
UPDATE records SET channel = 'Specular Minecraft', updated_at = now()
WHERE channel = 'Specular Gaming' AND (raw_content ~* '\m(minecraft|smp)\M' OR title ~* '\m(minecraft|smp)\M');

UPDATE records SET channel = 'Specular Roblox', updated_at = now()
WHERE channel = 'Specular Gaming' AND (raw_content ~* '\mroblox\M' OR title ~* '\mroblox\M');

UPDATE records SET channel = NULL, updated_at = now() WHERE channel = 'Specular Gaming';
