-- Refund policy: customer refund requests (staff-approved), GST credit notes and gateway disputes.
-- A frozen order is entitled to nothing, so 'refund-review' and 'disputed' sit outside the entitled statuses.

ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN
    ('pending', 'active', 'past-due', 'cancelled', 'expired', 'refund-review', 'refunded', 'disputed'));

ALTER TABLE subscriptions ADD COLUMN payment_instrument_hash text;
COMMENT ON COLUMN subscriptions.payment_instrument_hash IS
    'Salted hash of the card or UPI id the gateway reported for the payment; links accounts that share an instrument.';

-- A stored expiry: the quota counts only requests that revealed or may still reveal the number.
ALTER TABLE contact_requests DROP CONSTRAINT contact_requests_status_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_status_check CHECK (status IN
    ('pending', 'approved', 'declined', 'expired'));
CREATE INDEX idx_contact_requests_pending_created ON contact_requests (created_at) WHERE status = 'pending';

CREATE TABLE refund_requests (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES users (id),
    subscription_id uuid        NOT NULL REFERENCES subscriptions (id),
    kind            text        NOT NULL CHECK (kind IN ('listing_pass', 'contact_pack')),
    status          text        NOT NULL DEFAULT 'pending_review'
                                CHECK (status IN ('pending_review', 'approved', 'rejected')),
    basis           text        NOT NULL CHECK (basis IN ('pack_unused', 'pass_no_enquiries')),
    amount          bigint      NOT NULL CHECK (amount > 0),
    customer_reason text,
    idempotency_key text        NOT NULL,
    device_id_hash  text,
    instrument_hash text,
    listing_paused  boolean     NOT NULL DEFAULT false,
    decided_by      uuid        REFERENCES users (id),
    decided_at      timestamptz,
    decision_reason text,
    version         bigint      NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_refund_requests_subscription UNIQUE (subscription_id),
    CONSTRAINT uq_refund_requests_idempotency UNIQUE (user_id, idempotency_key)
);
CREATE INDEX idx_refund_requests_status ON refund_requests (status, created_at DESC);
CREATE INDEX idx_refund_requests_device ON refund_requests (device_id_hash) WHERE device_id_hash IS NOT NULL;
CREATE INDEX idx_refund_requests_instrument ON refund_requests (instrument_hash) WHERE instrument_hash IS NOT NULL;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON refund_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON COLUMN refund_requests.listing_paused IS
    'True when freezing the order paused its listing, so a rejection resumes it.';

CREATE TABLE credit_note_sequences (
    fy         text   PRIMARY KEY,
    last_value bigint NOT NULL
);

CREATE TABLE credit_notes (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    number         text        NOT NULL UNIQUE,
    user_id        uuid        NOT NULL REFERENCES users (id),
    source_type    text        NOT NULL CHECK (source_type IN ('subscription', 'service_request_refund')),
    source_id      uuid        NOT NULL,
    order_ref      text,
    amount         bigint      NOT NULL CHECK (amount > 0),
    taxable_amount bigint      NOT NULL CHECK (taxable_amount >= 0),
    gst_amount     bigint      NOT NULL CHECK (gst_amount >= 0),
    gst_percent    numeric(5, 2) NOT NULL,
    issued_at      timestamptz NOT NULL DEFAULT now(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_credit_notes_source UNIQUE (source_type, source_id)
);
CREATE INDEX idx_credit_notes_user ON credit_notes (user_id, issued_at DESC);
COMMENT ON COLUMN credit_notes.amount IS
    'Whole rupees refunded, GST included; taxable_amount + gst_amount may be less when part is statutory pass-through.';

CREATE TABLE payment_disputes (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_ref     text        NOT NULL UNIQUE,
    order_ref       text        NOT NULL,
    user_id         uuid        REFERENCES users (id),
    subscription_id uuid        REFERENCES subscriptions (id),
    status          text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'accepted')),
    provider_status text,
    amount          bigint,
    reason          text,
    frozen_from     text,
    listing_paused  boolean     NOT NULL DEFAULT false,
    opened_at       timestamptz NOT NULL DEFAULT now(),
    closed_at       timestamptz,
    version         bigint      NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_disputes_order ON payment_disputes (order_ref);
CREATE INDEX idx_payment_disputes_user ON payment_disputes (user_id) WHERE user_id IS NOT NULL;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON payment_disputes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON COLUMN payment_disputes.frozen_from IS
    'The subscription status this dispute froze, restored when the dispute is won; null when nothing was frozen.';
COMMENT ON COLUMN payment_disputes.listing_paused IS
    'True when freezing the order paused its listing, so winning the dispute resumes it.';
