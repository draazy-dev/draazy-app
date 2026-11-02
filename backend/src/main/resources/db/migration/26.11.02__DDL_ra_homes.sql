-- Not address_fingerprint: ManagedFlatmateHomes lists every fingerprinted record as a flatmate home.
-- Squashed flatNo|society|pincode from RentAgreementOverlaps.flatKey, so renewing a flat refreshes one record.
ALTER TABLE managed_properties
    ADD COLUMN agreement_flat_key text,
    ADD COLUMN lease_end date;

CREATE UNIQUE INDEX uq_managed_properties_agreement_flat
    ON managed_properties (owner_id, agreement_flat_key)
    WHERE agreement_flat_key IS NOT NULL;
