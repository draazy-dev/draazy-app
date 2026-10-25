ALTER TABLE flatmate_reviews
    ADD COLUMN evidence_type      text,
    ADD COLUMN evidence_issued_on date,
    ADD COLUMN name_matches       boolean,
    ADD COLUMN address_matches    boolean,
    ADD CONSTRAINT ck_flatmate_reviews_evidence_type
        CHECK (evidence_type IS NULL OR evidence_type IN ('rent_agreement', 'electricity_bill'));

COMMENT ON COLUMN flatmate_reviews.evidence_type IS
    'What the host filed: a rent agreement or a light bill naming the flat owner. Decides which date the '
    'reviewer records and how the badge expiry is derived.';

COMMENT ON COLUMN flatmate_reviews.evidence_issued_on IS
    'Bill date of a light bill, recorded by the reviewer on approval. Null for an agreement, whose end date '
    'lives in agreement_valid_till.';

COMMENT ON COLUMN flatmate_reviews.name_matches IS
    'The reviewer''s approval check: the name on the document matches the host''s ID-verified name (agreement) '
    'or the flat owner (light bill). Cleared whenever the review reopens.';

COMMENT ON COLUMN flatmate_reviews.address_matches IS
    'The reviewer''s approval check: the document''s address is the post''s flat. Cleared whenever the review reopens.';
