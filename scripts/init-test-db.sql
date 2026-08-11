-- Runs once on first container start, alongside the main fusguessr database.
-- The integration suite truncates every table, so it needs its own database.
CREATE DATABASE fusguessr_test;
