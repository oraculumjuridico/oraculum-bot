-- Migration id: case-number-reservations-v2-reconcile-checks
-- Executed only by: npm run case-number:migrate -- --reconcile
-- The runner validates the legacy structure and every existing row before this
-- DDL, then validates the complete schema and records v2. It never records v1.

ALTER TABLE case_number_reservations
  ADD CONSTRAINT case_number_reservations_number_format
  CHECK (case_number ~ '^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$');

ALTER TABLE case_number_reservations
  ADD CONSTRAINT case_number_reservations_status_check
  CHECK (status IN ('reserved'));

ALTER TABLE case_number_reservations
  ADD CONSTRAINT case_number_reservations_area_check
  CHECK (area = btrim(area) AND char_length(area) BETWEEN 1 AND 80);
