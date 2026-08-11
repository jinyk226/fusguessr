-- Force canonical pair ordering at the database level.
--
-- The @@unique([pokemonAId, pokemonBId]) index only makes "a pair can never be
-- fused twice" true if every write site orders the pair the same way first.
-- That is a convention, and conventions get forgotten - a single code path that
-- inserts (7,6) alongside an existing (6,7) silently creates a duplicate
-- fusion of the same two Pokemon.
--
-- This CHECK removes the convention from the equation: a non-canonical pair
-- cannot be stored at all, by any code path, including raw SQL. Combined with
-- the unique index, (A,B) and (B,A) are now structurally the same row.
ALTER TABLE "Fusion"
  ADD CONSTRAINT "Fusion_pokemon_pair_canonical_order"
  CHECK ("pokemonAId" < "pokemonBId");
