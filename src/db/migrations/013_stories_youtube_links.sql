-- The Stories channels' YouTube pages, as the studio gave them. Only fills
-- channels with no link yet; a link set on the Uploads page is never
-- overwritten, and one cleared there stays cleared (this runs once).
-- Specular Survives is @SpecularRoyale — the one handle that isn't its name.
INSERT INTO youtube_channels (channel, input) VALUES
  ('Specular Studios',       'https://www.youtube.com/@SpecularStudio'),
  ('Specular Anime',         'https://www.youtube.com/@SpecularAnime'),
  ('Specular FNAF',          'https://www.youtube.com/@SpecularFNAF'),
  ('Specular Horror',        'https://www.youtube.com/@SpecularHorror'),
  ('Specular Manga',         'https://www.youtube.com/@SpecularManga'),
  ('Specular Verse',         'https://www.youtube.com/@SpecularVerse'),
  ('Specular Animation',     'https://www.youtube.com/@SpecularAnimation'),
  ('Specular Comics',        'https://www.youtube.com/@SpecularComics'),
  ('Specular Documentaries', 'https://www.youtube.com/@SpecularDocumentaries'),
  ('Specular Force',         'https://www.youtube.com/@SpecularForce'),
  ('Specular YOU',           'https://www.youtube.com/@SpecularYOU'),
  ('Specular Battles',       'https://www.youtube.com/@SpecularBattles'),
  ('Specular Law',           'https://www.youtube.com/@SpecularLaw'),
  ('Specular Survives',      'https://www.youtube.com/@SpecularRoyale')
ON CONFLICT (channel) DO NOTHING;
