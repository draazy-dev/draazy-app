ALTER TABLE subscriptions
    ADD COLUMN refund_due_at timestamptz,
    ADD COLUMN refund_ref text;

COMMENT ON COLUMN subscriptions.refund_due_at IS
    'Set when a payment arrived for an order we had already cancelled or whose listing was no longer live; the money goes back.';
COMMENT ON COLUMN subscriptions.refund_ref IS
    'The gateway refund id once the money has been sent back; null while a refund is still due.';

CREATE INDEX idx_subscriptions_refund_due ON subscriptions (refund_due_at) WHERE refund_ref IS NULL AND refund_due_at IS NOT NULL;
