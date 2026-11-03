ALTER TABLE flatmate_rooms
    ADD COLUMN parking text,
    ADD COLUMN amenities jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE flatmate_rooms
    ADD CONSTRAINT flatmate_rooms_parking_chk CHECK (parking IS NULL OR parking IN ('bike', 'car')),
    ADD CONSTRAINT flatmate_rooms_amenities_chk CHECK (jsonb_typeof(amenities) = 'array');
