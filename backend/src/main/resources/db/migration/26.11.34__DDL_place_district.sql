ALTER TABLE localities
    ADD COLUMN district text,
    ADD COLUMN district_checked_at timestamptz;

ALTER TABLE societies
    ADD COLUMN district text,
    ADD COLUMN district_checked_at timestamptz;
