-- Dalora salon management — initial schema
-- Times are stored as timestamptz (UTC). Each salon has its own IANA time zone (default Asia/Riyadh).

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE member_role AS ENUM ('owner', 'manager', 'reception', 'staff', 'accountant');
CREATE TYPE booking_status AS ENUM ('booked', 'arrived', 'in_service', 'done', 'no_show', 'cancelled');
CREATE TYPE booking_source AS ENUM ('app', 'phone', 'walk_in', 'social');
CREATE TYPE booking_location AS ENUM ('salon', 'home');
CREATE TYPE pay_method AS ENUM ('cash', 'card', 'online', 'transfer');
CREATE TYPE pay_kind AS ENUM ('payment', 'deposit', 'refund');

CREATE TABLE salons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  area         text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  timezone     text NOT NULL DEFAULT 'Asia/Riyadh',
  opens_min    int  NOT NULL DEFAULT 600  CHECK (opens_min BETWEEN 0 AND 1439),
  closes_min   int  NOT NULL DEFAULT 1380 CHECK (closes_min BETWEEN 1 AND 1440),
  -- policies
  cancel_hours int  NOT NULL DEFAULT 24,
  deposit_pct  int  NOT NULL DEFAULT 20 CHECK (deposit_pct BETWEEN 0 AND 100),
  late_mins    int  NOT NULL DEFAULT 15,
  lead_mins    int  NOT NULL DEFAULT 60,
  slot_step    int  NOT NULL DEFAULT 15 CHECK (slot_step IN (5, 10, 15, 20, 30)),
  vat_pct      numeric(5,2) NOT NULL DEFAULT 15,
  home_service boolean NOT NULL DEFAULT false,
  home_fee     numeric(10,2) NOT NULL DEFAULT 50,
  travel_mins  int  NOT NULL DEFAULT 30,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_min > opens_min)
);

CREATE TABLE users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text NOT NULL UNIQUE,           -- E.164, e.g. +9665XXXXXXXX
  name       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id       uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name           text NOT NULL,
  title          text NOT NULL DEFAULT '',
  color          text NOT NULL DEFAULT '#B9708A',
  -- weekly hours: {"0":[600,1380], ...} keyed by weekday (0 = Sunday); a missing day is a day off
  week           jsonb NOT NULL DEFAULT '{}'::jsonb,
  works_home     boolean NOT NULL DEFAULT false,
  commission_pct numeric(5,2) NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  sort           int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON staff (salon_id);

CREATE TABLE memberships (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id  uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      member_role NOT NULL,
  staff_id  uuid REFERENCES staff(id) ON DELETE SET NULL,  -- set when role = 'staff'
  active    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, user_id)
);

CREATE TABLE otp_codes (
  phone      text PRIMARY KEY,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   int NOT NULL DEFAULT 0,
  sent_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  salon_id   uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sessions (user_id);

CREATE TABLE staff_time_off (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id  uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  staff_id  uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  reason    text NOT NULL DEFAULT '',
  CHECK (ends_at > starts_at)
);
CREATE INDEX ON staff_time_off (staff_id, starts_at);

CREATE TABLE services (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id     uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name         text NOT NULL,
  category     text NOT NULL DEFAULT '',
  duration_min int  NOT NULL CHECK (duration_min > 0),
  buffer_min   int  NOT NULL DEFAULT 0 CHECK (buffer_min >= 0),
  price        numeric(10,2) NOT NULL CHECK (price >= 0),
  home_ok      boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true,
  sort         int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON services (salon_id);

CREATE TABLE service_staff (
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  staff_id   uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, staff_id)
);

CREATE TABLE customers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id   uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  phone      text NOT NULL,
  notes      text NOT NULL DEFAULT '',
  allergies  text NOT NULL DEFAULT '',
  tags       text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, phone)
);
CREATE INDEX ON customers (salon_id, name);

CREATE TABLE bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id      uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  code          text NOT NULL,
  customer_id   uuid NOT NULL REFERENCES customers(id),
  staff_id      uuid NOT NULL REFERENCES staff(id),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  buffer_min    int NOT NULL DEFAULT 0,
  travel_min    int NOT NULL DEFAULT 0,
  -- the time the staff member is unavailable: travel + service + cleanup. Kept by a trigger.
  occupied      tstzrange NOT NULL,
  status        booking_status NOT NULL DEFAULT 'booked',
  source        booking_source NOT NULL DEFAULT 'phone',
  location      booking_location NOT NULL DEFAULT 'salon',
  address       text NOT NULL DEFAULT '',
  subtotal      numeric(10,2) NOT NULL DEFAULT 0,
  discount      numeric(10,2) NOT NULL DEFAULT 0,
  home_fee      numeric(10,2) NOT NULL DEFAULT 0,
  total         numeric(10,2) NOT NULL DEFAULT 0,
  paid          numeric(10,2) NOT NULL DEFAULT 0,   -- sum of payments minus refunds, kept by the app in the same transaction
  notes         text NOT NULL DEFAULT '',
  cancel_reason text NOT NULL DEFAULT '',
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, code),
  CHECK (ends_at > starts_at),
  -- THE double-booking guard: no two live bookings may overlap for the same staff member.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (staff_id WITH =, occupied WITH &&)
    WHERE (status NOT IN ('cancelled', 'no_show'))
);
CREATE INDEX ON bookings (salon_id, starts_at);
CREATE INDEX ON bookings (customer_id);

CREATE FUNCTION bookings_set_occupied() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.occupied := tstzrange(
    NEW.starts_at - make_interval(mins => NEW.travel_min),
    NEW.ends_at   + make_interval(mins => NEW.buffer_min + NEW.travel_min),
    '[)');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_occupied BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION bookings_set_occupied();

CREATE TABLE booking_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id   uuid REFERENCES services(id) ON DELETE SET NULL,
  name         text NOT NULL,
  duration_min int NOT NULL,
  price        numeric(10,2) NOT NULL,
  sort         int NOT NULL DEFAULT 0
);
CREATE INDEX ON booking_items (booking_id);

CREATE TABLE day_closes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id      uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  expected_cash numeric(10,2) NOT NULL,
  counted_cash  numeric(10,2) NOT NULL,
  difference    numeric(10,2) NOT NULL,
  card_total    numeric(10,2) NOT NULL,
  online_total  numeric(10,2) NOT NULL,
  transfer_total numeric(10,2) NOT NULL,
  note          text NOT NULL DEFAULT '',
  closed_by     uuid REFERENCES users(id),
  closed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, business_date)
);

CREATE TABLE payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id    uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  method      pay_method NOT NULL,
  kind        pay_kind NOT NULL DEFAULT 'payment',
  amount      numeric(10,2) NOT NULL CHECK (amount > 0),
  business_date date NOT NULL,             -- the salon-local day the money was taken
  note        text NOT NULL DEFAULT '',
  received_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON payments (salon_id, business_date);
CREATE INDEX ON payments (booking_id);

CREATE TABLE audit_log (
  id        bigserial PRIMARY KEY,
  salon_id  uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  entity    text NOT NULL,
  entity_id uuid,
  action    text NOT NULL,
  detail    jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id   uuid REFERENCES users(id),
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (salon_id, entity, entity_id);

