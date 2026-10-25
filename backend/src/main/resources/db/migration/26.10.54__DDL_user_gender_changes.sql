ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_changes integer NOT NULL DEFAULT 0 CHECK (gender_changes >= 0);
