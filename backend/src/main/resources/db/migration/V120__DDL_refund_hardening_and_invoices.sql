ALTER TABLE subscriptions ADD COLUMN frozen_at timestamptz;
UPDATE subscriptions SET frozen_at = now() WHERE status IN ('refund-review', 'disputed');
COMMENT ON COLUMN subscriptions.frozen_at IS
    'When the order stopped entitling for a refund review or a dispute; the term is pushed out by this long when it is restored.';

ALTER TABLE contact_requests ADD COLUMN enquired_at timestamptz;
UPDATE contact_requests SET enquired_at = LEAST(created_at, first_requested_at);
ALTER TABLE contact_requests
    ALTER COLUMN enquired_at SET DEFAULT now(),
    ALTER COLUMN enquired_at SET NOT NULL;
COMMENT ON COLUMN contact_requests.enquired_at IS
    'When the asker first enquired on the listing. Written once and never moved, not even by a renewal.';

CREATE TABLE property_live_gaps (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id      uuid        NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
    left_live_at     timestamptz NOT NULL,
    returned_live_at timestamptz
);
CREATE INDEX idx_property_live_gaps_property ON property_live_gaps (property_id, left_live_at);
CREATE UNIQUE INDEX uq_property_live_gaps_open ON property_live_gaps (property_id) WHERE returned_live_at IS NULL;
COMMENT ON TABLE property_live_gaps IS
    'Every stretch a listing was not approved and unarchived, written by a trigger so no code path can skip it.';

CREATE FUNCTION record_property_live_gap() RETURNS trigger AS $$
DECLARE
    was_live boolean := OLD.status = 'approved' AND NOT OLD.archived;
    is_live  boolean := NEW.status = 'approved' AND NOT NEW.archived;
BEGIN
    IF was_live AND NOT is_live THEN
        INSERT INTO property_live_gaps (property_id, left_live_at)
        VALUES (NEW.id, clock_timestamp())
        ON CONFLICT DO NOTHING;
    ELSIF is_live AND NOT was_live THEN
        UPDATE property_live_gaps SET returned_live_at = clock_timestamp()
        WHERE property_id = NEW.id AND returned_live_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_property_live_gaps
    AFTER UPDATE OF status, archived ON properties
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.archived IS DISTINCT FROM NEW.archived)
    EXECUTE FUNCTION record_property_live_gap();

INSERT INTO property_live_gaps (property_id, left_live_at)
SELECT p.id, COALESCE(p.updated_at, now())
FROM properties p
WHERE p.status = 'paused' AND NOT p.archived;

CREATE TABLE invoice_sequences (
    fy         text   PRIMARY KEY,
    last_value bigint NOT NULL
);

CREATE TABLE invoices (
    id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    number         text          NOT NULL UNIQUE,
    user_id        uuid          NOT NULL REFERENCES users (id),
    source_type    text          NOT NULL CHECK (source_type IN ('subscription', 'service_request', 'service_request_amendment')),
    source_id      uuid          NOT NULL,
    order_ref      text,
    amount         bigint        NOT NULL CHECK (amount > 0),
    taxable_amount bigint        NOT NULL CHECK (taxable_amount >= 0),
    gst_amount     bigint        NOT NULL CHECK (gst_amount >= 0),
    gst_percent    numeric(5, 2) NOT NULL,
    issued_at      timestamptz   NOT NULL,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_invoices_source UNIQUE (source_type, source_id)
);
CREATE INDEX idx_invoices_user ON invoices (user_id, issued_at DESC);
COMMENT ON TABLE invoices IS
    'One GST tax invoice per successful payment, numbered per financial year. Whole rupees, GST included in amount.';
COMMENT ON COLUMN invoices.amount IS
    'What the customer paid, GST included; taxable_amount + gst_amount is the part carrying GST, the rest is statutory pass-through.';

ALTER TABLE credit_notes ADD COLUMN invoice_no text;
COMMENT ON COLUMN credit_notes.invoice_no IS 'The tax invoice this note credits, when the order had one.';

CREATE TEMP TABLE invoice_backfill AS
WITH fee AS (
    SELECT COALESCE((SELECT (value ->> 'rentAgreementPlatform')::bigint FROM settings WHERE key = 'fees'), 499) AS platform,
           COALESCE((SELECT (value ->> 'gstPercent')::numeric FROM settings WHERE key = 'fees'), 0) AS gst
), paid AS (
    SELECT 'subscription'::text AS source_type, s.id AS source_id, s.user_id, s.payment_ref AS order_ref,
           s.amount AS amount, s.amount AS taxable_incl, s.started_at AS paid_at
    FROM subscriptions s
    WHERE s.amount > 0 AND s.payment_ref IS NOT NULL
      AND s.status IN ('active', 'past-due', 'expired', 'refund-review', 'refunded', 'disputed')
    UNION ALL
    SELECT 'service_request', r.id, r.requester_id, r.payment_ref,
           first.amount, LEAST(first.amount, fee.platform + ROUND(fee.platform * fee.gst / 100)::bigint),
           COALESCE((SELECT MIN(t.at) FROM service_request_timeline t
                     WHERE t.request_id = r.id AND t.event = 'payment.received'), r.status_changed_at, r.created_at)
    FROM service_requests r
    CROSS JOIN fee
    CROSS JOIN LATERAL (
        SELECT COALESCE(r.amount, 0) - COALESCE((
            SELECT SUM(a.amount_after - a.amount_before) FROM service_request_amendments a
            WHERE a.service_request_id = r.id AND a.payment_ref IS NOT NULL
              AND a.amount_after > a.amount_before AND (a.status = 'applied' OR a.paid_at IS NOT NULL)), 0) AS amount
    ) first
    WHERE r.type = 'rent-agreement' AND r.payment_ref IS NOT NULL AND r.requester_id IS NOT NULL AND first.amount > 0
    UNION ALL
    SELECT 'service_request_amendment', a.id, r.requester_id, a.payment_ref,
           a.amount_after - a.amount_before, 0, COALESCE(a.paid_at, a.created_at)
    FROM service_request_amendments a
    JOIN service_requests r ON r.id = a.service_request_id
    WHERE a.payment_ref IS NOT NULL AND a.amount_after > a.amount_before AND r.requester_id IS NOT NULL
      AND (a.status = 'applied' OR a.paid_at IS NOT NULL)
)
SELECT paid.*,
       CASE WHEN m >= 4 THEN y ELSE y - 1 END AS start_year
FROM paid
CROSS JOIN LATERAL (
    SELECT EXTRACT(YEAR FROM paid.paid_at AT TIME ZONE 'Asia/Kolkata')::int AS y,
           EXTRACT(MONTH FROM paid.paid_at AT TIME ZONE 'Asia/Kolkata')::int AS m
) local_time;

INSERT INTO invoices (number, user_id, source_type, source_id, order_ref, amount, taxable_amount, gst_amount,
                      gst_percent, issued_at)
SELECT 'INV-FY' || LPAD((b.start_year % 100)::text, 2, '0') || LPAD(((b.start_year + 1) % 100)::text, 2, '0')
           || '-' || LPAD(b.seq::text, 6, '0'),
       b.user_id, b.source_type, b.source_id, b.order_ref, b.amount,
       ROUND(b.taxable_incl * 100 / (100 + b.pct)), b.taxable_incl - ROUND(b.taxable_incl * 100 / (100 + b.pct)),
       b.pct, b.paid_at
FROM (
    SELECT i.*, ROW_NUMBER() OVER (PARTITION BY i.start_year ORDER BY i.paid_at, i.source_id) AS seq,
           CASE WHEN g.gst > 0 THEN g.gst ELSE 18 END AS pct
    FROM invoice_backfill i
    CROSS JOIN (SELECT COALESCE((SELECT (value ->> 'gstPercent')::numeric FROM settings WHERE key = 'fees'), 0) AS gst) g
) b;

INSERT INTO invoice_sequences (fy, last_value)
SELECT LPAD((start_year % 100)::text, 2, '0') || LPAD(((start_year + 1) % 100)::text, 2, '0'), COUNT(*)
FROM invoice_backfill
GROUP BY start_year;

UPDATE credit_notes c SET invoice_no = i.number
FROM invoices i
WHERE i.order_ref IS NOT NULL AND i.order_ref = c.order_ref;
DROP TABLE invoice_backfill;
