-- One unpaid order per (requester, type, flat): an owner with several flats can have one agreement open on each.
-- Non rent-agreement types have no flat key, so they keep one per (requester, type).
DROP INDEX uq_service_requests_open_unpaid;

CREATE UNIQUE INDEX uq_service_requests_open_unpaid
    ON service_requests (requester_id, type, coalesce(rent_agreement_flat_key(details), ''))
    WHERE status = 'awaiting-payment';

ALTER TABLE service_requests ADD COLUMN payer_id uuid REFERENCES users(id);

CREATE INDEX idx_service_requests_payer ON service_requests (payer_id) WHERE payer_id IS NOT NULL;

COMMENT ON COLUMN service_requests.payer_id IS
    'Who opened the checkout behind payment_ref: the requester or an accepted co-fill party. '
    'NULL means the requester. Invoices, refunds and payment history for that order follow this user.';
