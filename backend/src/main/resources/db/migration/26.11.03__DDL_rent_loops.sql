-- Set only by ManagedAgreementHomes from a registered agreement; a renewal repoints it and resets the police stamp.
ALTER TABLE managed_properties
    ADD COLUMN agreement_request_id uuid REFERENCES service_requests(id) ON DELETE SET NULL,
    ADD COLUMN deposit bigint CHECK (deposit BETWEEN 0 AND 100000000),
    ADD COLUMN police_intimated_on date,
    -- Printed on the tenant's rent receipts: HRA claims above Rs 1 lakh a year need the landlord's PAN.
    ADD COLUMN landlord_pan varchar(10) CHECK (landlord_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

CREATE INDEX ix_managed_properties_agreement_request
    ON managed_properties (agreement_request_id)
    WHERE agreement_request_id IS NOT NULL;

-- The tenant's "I've paid". No user column: the claimant is whoever the record names as tenant, and
-- created_at against tenant_since hides a predecessor's claim from the next tenant.
CREATE TABLE managed_property_rent_claims (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    managed_property_id uuid NOT NULL REFERENCES managed_properties(id) ON DELETE CASCADE,
    rent_month          varchar(7) NOT NULL
        CONSTRAINT ck_managed_rent_claim_month CHECK (rent_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_managed_rent_claim_month
    ON managed_property_rent_claims (managed_property_id, rent_month);
