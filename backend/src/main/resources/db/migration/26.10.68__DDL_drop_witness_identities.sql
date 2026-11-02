DELETE FROM service_request_identities WHERE party_role = 'witness';

ALTER TABLE service_request_identities DROP CONSTRAINT service_request_identities_role_check;
ALTER TABLE service_request_identities
    ADD CONSTRAINT service_request_identities_role_check CHECK (party_role IN ('owner', 'tenant'));

-- updated_at drives the retention sweep; stripping data must not postpone a purge.
ALTER TABLE service_requests DISABLE TRIGGER trg_set_updated_at;
UPDATE service_requests SET details = details #- '{_state,wit}' WHERE details #> '{_state,wit}' IS NOT NULL;
ALTER TABLE service_requests ENABLE TRIGGER trg_set_updated_at;
