# Parked

This is the first-pass app layer, written against the earlier data model
(lanes, priority, a single `items` table). It is excluded from the build.

It is kept because the plumbing is still good — Discord client and intake
wiring, the digest cron, the Fastify server and auth, the migration runner —
and most of it will come back once the parser settles. What changed underneath
it is the model itself: four categories with named channels, project codes,
air dates with a derived VO buffer, review versions, and daily bits batches.

Rebuild order once the parser scores well: schema migration, then intake,
then the board.
