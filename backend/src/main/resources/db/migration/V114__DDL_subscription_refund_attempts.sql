ALTER TABLE subscriptions
    ADD COLUMN refund_attempts integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN subscriptions.refund_attempts IS
    'Refunds the gateway reported as failed; each retry needs a fresh gateway refund id, so this suffixes it.';
