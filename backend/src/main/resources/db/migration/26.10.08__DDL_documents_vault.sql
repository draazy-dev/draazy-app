-- Paperwork tables: the property vault, document requests and grants, owner KYC and ownership evidence.
-- `documents` must precede `property_ownership_evidence`, which has a foreign key to it.

-- A document needs a property or a service request: a row with neither is unreachable by any endpoint.
-- Service-request papers are required before checkout, even for flats that were never listed.
CREATE TABLE documents (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id        uuid REFERENCES properties(id),
    category           text,
    file_name          text,
    storage_key        text,
    size_bytes         bigint,
    mime_type          text,
    service_request_id uuid REFERENCES service_requests(id),
    uploaded_at        timestamptz NOT NULL DEFAULT now(),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT documents_subject_check
        CHECK (property_id IS NOT NULL OR service_request_id IS NOT NULL)
);

-- The vault list is "this property's documents, newest first"; this is the only index on property_id.
CREATE INDEX idx_documents_property_uploaded ON documents (property_id, uploaded_at DESC);

CREATE INDEX idx_documents_service_request ON documents (service_request_id) WHERE service_request_id IS NOT NULL;

-- A re-upload is a new document with no review row, so it is unreviewed again by construction.
CREATE TABLE service_request_document_reviews (
    id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id uuid         NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    document_id        uuid         NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
    verdict            varchar(10)  NOT NULL CHECK (verdict IN ('verified', 'rejected')),
    reason             varchar(300),
    reviewed_by        uuid         REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at        timestamptz  NOT NULL DEFAULT now(),
    created_at         timestamptz  NOT NULL DEFAULT now(),
    CHECK (verdict = 'verified' OR reason IS NOT NULL)
);

CREATE INDEX idx_service_request_document_reviews_request
    ON service_request_document_reviews (service_request_id);

-- A grant is time-boxed: without expires_at the share token would be a permanent bearer credential to title deeds.
CREATE TABLE document_requests (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id            uuid NOT NULL REFERENCES properties(id),
    requester_id           uuid NOT NULL REFERENCES users(id),
    categories             jsonb NOT NULL DEFAULT '[]'::jsonb,
    status                 text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','granted','declined','expired')),
    share_token            text,
    message                text,
    expires_at             timestamptz,
    acknowledged_disclaimer boolean NOT NULL DEFAULT false,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_requests_property  ON document_requests (property_id);
CREATE INDEX idx_document_requests_requester ON document_requests (requester_id);

-- UNIQUE makes a token collision a failed insert rather than a silent cross-account document leak.
CREATE UNIQUE INDEX uq_document_requests_share_token
    ON document_requests (share_token) WHERE share_token IS NOT NULL;

-- One pending ask per buyer per property, so a double-tap is not two leads. Partial: a later ask after an answer
-- is legitimate, and a total UNIQUE would make "no" permanent.
CREATE UNIQUE INDEX uq_document_requests_pending
    ON document_requests (requester_id, property_id) WHERE status = 'pending';

-- Serves the owner inbox (`property_id in (...)`, newest first): the scan stops at the page boundary.
CREATE INDEX idx_document_requests_property_created
    ON document_requests (property_id, created_at DESC);

-- Serves the buyer's list (rows you wrote); without it that read is a sequential scan plus a sort.
-- Not CONCURRENTLY: Flyway runs in a transaction and the table is small enough for a brief lock.
create index if not exists idx_document_requests_requester_created
    on document_requests (requester_id, created_at desc);

CREATE TABLE ownership_basis (
    property_id      uuid PRIMARY KEY REFERENCES properties(id),
    owner_id         uuid NOT NULL REFERENCES users(id),
    purchase_price   bigint,
    purchase_date    date,
    loan_outstanding bigint,
    emi              bigint,
    current_value    bigint,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE owner_kyc (
    user_id        uuid PRIMARY KEY REFERENCES users(id),
    pan_masked     text,
    aadhaar_masked text,
    bank_verified  boolean NOT NULL DEFAULT false,
    status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Personal KYC papers belong to the person, not a flat, and never pass through the request/grant flow.
-- No `url` column: a persisted URL would be a permanent bearer credential to someone's Aadhaar.
CREATE TABLE personal_documents (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid NOT NULL REFERENCES users(id),
    category    text,
    file_name   text,                                -- uploader's filename, sanitised; never the key
    storage_key text NOT NULL,
    size_bytes  bigint,
    mime_type   text,                                -- the type the bytes prove, not the one declared
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_personal_documents_owner_uploaded ON personal_documents (owner_id, uploaded_at DESC);

COMMENT ON TABLE personal_documents IS
    'A user''s own KYC/identity documents (Aadhaar, PAN, passport photo, ownership proof), owned by '
    'the person rather than any listing. Kept apart from `documents` so the property vault''s '
    'sharing and request logic can assume every row it holds belongs to a property.';

-- expires_at is stored, not derived on read, so changing a validity window does not un-verify live listings.
-- RESTRICT on property_id and recorded_by: deleting a listing or an ops user must fail, not take the case file with it.
CREATE TABLE property_ownership_evidence (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id  uuid        NOT NULL REFERENCES properties (id) ON DELETE RESTRICT,
    doc_type     text        NOT NULL CHECK (doc_type IN (
                                 'index_ii', 'sale_deed', 'tax_receipt', 'electricity_bill',
                                 'aadhaar', 'pan', 'site_photos', 'satbara_7_12', 'eight_a_extract',
                                 'property_card', 'share_certificate', 'power_of_attorney')),
    document_id  uuid        REFERENCES documents (id) ON DELETE SET NULL,
    subject_name text,
    issued_at    timestamptz NOT NULL,
    expires_at   timestamptz,
    recorded_by  uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT property_ownership_evidence_expiry_after_issue
        CHECK (expires_at IS NULL OR expires_at > issued_at),
    -- A power of attorney must name its principal, the owner the agent acts for.
    CONSTRAINT property_ownership_evidence_poa_names_principal
        CHECK (doc_type <> 'power_of_attorney'
               OR (subject_name IS NOT NULL AND btrim(subject_name) <> ''))
);

-- NOT VALID: older rows lack a name that cannot be reconstructed; it has no inline form, hence the ALTER.
ALTER TABLE property_ownership_evidence
    ADD CONSTRAINT property_ownership_evidence_identity_names_its_subject
        CHECK (doc_type NOT IN ('aadhaar', 'pan')
               OR (subject_name IS NOT NULL AND btrim(subject_name) <> ''))
        NOT VALID;

CREATE INDEX idx_ownership_evidence_property
    ON property_ownership_evidence (property_id);

COMMENT ON TABLE property_ownership_evidence IS
    'One document (or photo set) offered as proof for the Ownership Verified badge (D190/Q15). '
    'Rows are append-only in practice: a lapsed tax receipt is superseded by recording a newer '
    'one, not by editing the old row, so the case file still shows what the badge was granted on '
    'at the time it was granted.';

COMMENT ON COLUMN property_ownership_evidence.issued_at IS
    'When the document was issued, or the photographs taken — NOT when ops reviewed it. The whole '
    'point of the gate is that a stale document cannot mint a fresh badge, so every expiry is '
    'derived from this rather than from the review.';

COMMENT ON COLUMN property_ownership_evidence.expires_at IS
    'issued_at + the validity window for this doc_type, or NULL for the registry and identity '
    'documents that never go stale. Stored rather than derived on read so that changing a window '
    'applies to future evidence instead of retroactively un-verifying live listings.';

COMMENT ON COLUMN property_ownership_evidence.document_id IS
    'The documents-vault row this evidence points at, when the proof was uploaded rather than '
    'sighted. Nullable and ON DELETE SET NULL: deleting a file must not erase the record that ops '
    'saw one, because that record is the audit trail for a decision already taken.';

COMMENT ON COLUMN property_ownership_evidence.subject_name IS
    'Whose identity was sighted -- the name as it appears on the document (D202). Required for the '
    'identity doc types and optional for the rest, which is what the accompanying CHECK enforces. '
    'Without it an owner_identity row asserts that some identity document was seen without saying '
    'whose, which is unfalsifiable and therefore worthless in the dispute that is the only reason '
    'this table is read. The document number is deliberately not stored, masked or otherwise: the '
    'name is the fact a dispute turns on, and it is the least that establishes it.';

COMMENT ON CONSTRAINT property_ownership_evidence_property_id_fkey ON property_ownership_evidence IS
    'RESTRICT, not CASCADE (D202). The evidence is the record behind a trust claim a buyer relied '
    'on, and the revoke path is written on the promise that it survives. Deleting the listing must '
    'fail loudly rather than quietly take the case file with it.';

SELECT install_updated_at_triggers();
