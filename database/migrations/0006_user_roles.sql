-- Mirror Clerk application roles for reporting and audit.
-- Runtime authorization continues to use Clerk-signed session claims.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'user';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_role_check'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_role_check
            CHECK (role IN ('user', 'developer'));
    END IF;
END
$$;

