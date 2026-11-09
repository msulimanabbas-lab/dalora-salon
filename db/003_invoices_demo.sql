-- Simplified tax invoices (ZATCA phase 1, laid out for phase 2) and the shared demo salon.

ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS vat_number   text NOT NULL DEFAULT '',   -- 15 digits, starts and ends with 3
  ADD COLUMN IF NOT EXISTS cr_number    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_icv  int  NOT NULL DEFAULT 0,    -- last invoice counter value (never reused)
  ADD COLUMN IF NOT EXISTS invoice_pih  text NOT NULL DEFAULT '',   -- hash of the last invoice ('' = none yet)
  ADD COLUMN IF NOT EXISTS is_demo      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_day     date;

CREATE TABLE IF NOT EXISTS invoices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id    uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('invoice', 'credit')),  -- 388 simplified invoice / 381 credit note
  ref_id      uuid REFERENCES invoices(id),                         -- the invoice a credit note corrects
  icv         int  NOT NULL,                                        -- counter, strictly increasing per salon
  number      text NOT NULL,
  uuid        uuid NOT NULL DEFAULT gen_random_uuid(),
  issued_at   timestamptz NOT NULL DEFAULT now(),
  seller      jsonb NOT NULL,                                       -- name, vat_number, cr_number, address at issue time
  buyer_name  text NOT NULL DEFAULT '',
  lines       jsonb NOT NULL,                                       -- [{name, qty, unit_incl, total_incl}]
  vat_pct     numeric(5,2) NOT NULL,
  total_excl  numeric(12,2) NOT NULL,
  vat         numeric(12,2) NOT NULL,
  total_incl  numeric(12,2) NOT NULL,
  pih         text NOT NULL,                                        -- previous invoice hash
  hash        text NOT NULL,
  qr          text NOT NULL,                                        -- base64 TLV
  share_token text NOT NULL UNIQUE,
  reason      text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id),
  UNIQUE (salon_id, icv),
  UNIQUE (salon_id, number)
);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_booking ON invoices (booking_id) WHERE kind = 'invoice';
CREATE INDEX IF NOT EXISTS invoices_salon_day ON invoices (salon_id, issued_at);

-- An issued invoice is final: corrections go through a credit note, never an edit or a delete.
-- (Only the demo reset and the developer seed may clear them, by setting dalora.wipe for their transaction.)
CREATE OR REPLACE FUNCTION invoices_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.booking_id IS NULL AND OLD.booking_id IS NOT NULL
     AND (to_jsonb(NEW) - 'booking_id') = (to_jsonb(OLD) - 'booking_id') THEN
    RETURN NEW;  -- the booking was deleted; the invoice stays
  END IF;
  IF current_setting('dalora.wipe', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'issued invoices cannot be changed or deleted';
END $$;
DROP TRIGGER IF EXISTS invoices_immutable ON invoices;
CREATE TRIGGER invoices_immutable BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION invoices_immutable();
