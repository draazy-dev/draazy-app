ALTER TABLE properties
    ADD COLUMN rera_check      text
        CONSTRAINT properties_rera_check_check CHECK (rera_check IN ('verified', 'not_found', 'mismatch')),
    ADD COLUMN rera_checked_at timestamptz,
    ADD COLUMN rera_checked_by uuid REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT properties_rera_checked_together
        CHECK ((rera_check IS NULL) = (rera_checked_at IS NULL AND rera_checked_by IS NULL));

ALTER TABLE property_reviews DROP CONSTRAINT ck_property_reviews_reason_code;
ALTER TABLE property_reviews
    ADD CONSTRAINT ck_property_reviews_reason_code
        CHECK (reason_code IS NULL OR reason_code IN (
            'photos_not_real',
            'duplicate',
            'broker',
            'wrong_details',
            'locality_unclear',
            'document_unreadable',
            'name_mismatch',
            'rera_not_found',
            'rera_mismatch',
            'other'
        ));
