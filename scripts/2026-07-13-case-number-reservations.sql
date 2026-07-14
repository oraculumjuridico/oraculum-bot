-- PROPOSED MIGRATION — NOT EXECUTED AUTOMATICALLY
-- This file is a prepared migration proposal and MUST be integrated into the project's migration tooling
-- and applied via proper change management process before activating CASE_NUMBER_RESERVATION_MODE=postgres.
-- Do not apply manually to production without approval and backup.
--
-- Migration: create case_number_reservations
-- Description: reservation table for internal case numbers (idempotent, unique constraints)

CREATE TABLE IF NOT EXISTS case_number_reservations (
  reservation_key TEXT PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  area TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Recommended atomic reservation operation (example, use in application code):
--
-- WITH attempt AS (
--   INSERT INTO case_number_reservations(reservation_key, case_number, area, status)
--   VALUES($1, $2, $3, 'reserved')
--   ON CONFLICT (reservation_key) DO NOTHING
--   RETURNING reservation_key
-- )
-- SELECT reservation_key FROM attempt;

-- Record migration in oraculum_state_migrations (application side may record this):
-- INSERT INTO oraculum_state_migrations(migration_id, details) VALUES ('case-number-reservations-v1', 'create table case_number_reservations');
