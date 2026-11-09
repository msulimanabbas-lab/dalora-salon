-- Arrival flow: when the customer confirmed, arrived, started and finished.
-- Most salons here take bookings by WhatsApp, so it becomes its own source.
ALTER TYPE booking_source ADD VALUE IF NOT EXISTS 'whatsapp';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_at   timestamptz,
  ADD COLUMN IF NOT EXISTS started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at  timestamptz;

-- existing bookings: best guess from the appointment itself
UPDATE bookings SET arrived_at = starts_at  WHERE status IN ('arrived', 'in_service', 'done') AND arrived_at IS NULL;
UPDATE bookings SET started_at = starts_at  WHERE status IN ('in_service', 'done') AND started_at IS NULL;
UPDATE bookings SET finished_at = ends_at   WHERE status = 'done' AND finished_at IS NULL;
