-- Migration id: case-number-reservations-v1
-- Executed only by: npm run case-number:migrate
-- The runner owns BEGIN/COMMIT, validates the complete schema and records the
-- migration in oraculum_state_migrations. This file documents the exact DDL.

CREATE TABLE IF NOT EXISTS case_number_reservations (
  reservation_key TEXT PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  area TEXT NOT NULL CHECK (area = btrim(area) AND char_length(area) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT case_number_reservations_number_format
    CHECK (case_number ~ '^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$')
);
