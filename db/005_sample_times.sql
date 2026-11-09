-- Sample bookings get believable arrival / start / finish times, so the specialist report has
-- something to read: some arrive early, some late; some specialists start late or run over.
-- Only bookings of sample customers ("مثال: …") are touched, unless p_all (developer seed).
CREATE OR REPLACE FUNCTION dalora_vary_sample_times(p_salon uuid, p_all boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _bias (staff_id uuid PRIMARY KEY, k int) ON COMMIT DROP;
  DELETE FROM _bias;
  INSERT INTO _bias SELECT id, ((row_number() OVER (ORDER BY sort, name)) - 1)::int % 5 FROM staff WHERE salon_id = p_salon;

  UPDATE bookings b SET
    arrived_at = CASE WHEN b.status IN ('arrived', 'in_service', 'done')
                      THEN LEAST(b.starts_at + make_interval(mins => floor(random() * 18 - 12)::int), now()) END
  FROM customers c
  WHERE b.salon_id = p_salon AND c.id = b.customer_id AND (p_all OR c.name LIKE 'مثال:%');

  UPDATE bookings b SET
    started_at = CASE WHEN b.status IN ('in_service', 'done')
                      THEN LEAST(GREATEST(b.arrived_at, b.starts_at) + make_interval(mins => (x.k * 2 + floor(random() * 5))::int), now()) END
  FROM customers c, _bias x
  WHERE b.salon_id = p_salon AND c.id = b.customer_id AND x.staff_id = b.staff_id AND (p_all OR c.name LIKE 'مثال:%');

  UPDATE bookings b SET
    finished_at = CASE WHEN b.status = 'done'
                       THEN LEAST(b.started_at + (b.ends_at - b.starts_at) * (0.92 + random() * 0.12 + x.k * 0.05), now()) END
  FROM customers c, _bias x
  WHERE b.salon_id = p_salon AND c.id = b.customer_id AND x.staff_id = b.staff_id AND (p_all OR c.name LIKE 'مثال:%');
END $$;

SELECT dalora_vary_sample_times(id) FROM salons;
