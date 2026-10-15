ALTER TABLE users DROP CONSTRAINT users_mobile_check;
ALTER TABLE users ADD CONSTRAINT users_mobile_check
    CHECK (mobile ~ '^[6-9][0-9]{9}$' OR (archived AND mobile ~ '^[0-5][0-9]{9}$'));
