ALTER TABLE flatmate_seeker_posts
    ADD COLUMN furnishing    text    CHECK (furnishing IS NULL OR furnishing IN ('unfurnished', 'semi', 'furnished')),
    ADD COLUMN gated_only    boolean NOT NULL DEFAULT false,
    ADD COLUMN attached_bath boolean NOT NULL DEFAULT false,
    ADD COLUMN parking       text    CHECK (parking IS NULL OR parking IN ('bike', 'car'));

ALTER TABLE flatmate_groups
    ADD COLUMN parking text CHECK (parking IS NULL OR parking IN ('bike', 'car'));

COMMENT ON COLUMN flatmate_seeker_posts.parking IS 'Parking the seeker needs; NULL means none.';
COMMENT ON COLUMN flatmate_groups.parking IS 'Parking a Team up group needs; NULL means none. Always NULL on a hosted group.';
