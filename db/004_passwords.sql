-- Username + password sign-in (phone codes stay available once an SMS provider is set up).
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username      text,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS must_change   boolean NOT NULL DEFAULT false,  -- set for passwords the system generated
  ADD COLUMN IF NOT EXISTS failed_logins int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until  timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users (lower(username)) WHERE username IS NOT NULL;
