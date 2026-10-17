-- Set once by the user (staff may correct it from the ID); the flatmates gender gate reads it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female'));
