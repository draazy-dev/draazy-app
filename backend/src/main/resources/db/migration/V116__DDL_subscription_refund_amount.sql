ALTER TABLE subscriptions
    ADD COLUMN refund_amount bigint;
COMMENT ON COLUMN subscriptions.refund_amount IS
    'Whole rupees to send back when it differs from amount: the provider reported a different sum than the order was for. Null refunds amount.';
