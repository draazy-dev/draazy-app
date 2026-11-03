ALTER TABLE property_reviews
    ALTER COLUMN property_id DROP NOT NULL,
    ADD COLUMN flatmate_post_id uuid UNIQUE,
    ADD COLUMN flatmate_kind text
        CONSTRAINT ck_property_reviews_flatmate_kind CHECK (flatmate_kind IN ('post', 'room', 'group')),
    ADD CONSTRAINT ck_property_reviews_one_subject
        CHECK ((property_id IS NOT NULL) <> (flatmate_post_id IS NOT NULL)
               AND (flatmate_post_id IS NULL) = (flatmate_kind IS NULL));
