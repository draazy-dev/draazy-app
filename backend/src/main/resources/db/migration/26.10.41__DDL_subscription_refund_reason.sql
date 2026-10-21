ALTER TABLE subscriptions
    ADD COLUMN refund_reason text
        CHECK (refund_reason IN ('paid_after_cancel', 'listing_gone', 'amount_mismatch', 'customer_request',
                                 'gateway_dashboard')),
    -- The gateway's word that the money went back; refund_ref only says it accepted the request.
    ADD COLUMN refund_settled_at timestamptz;

-- Rows refunded before this column existed: the audit trail is the only record of why.
UPDATE subscriptions s SET refund_reason = CASE
    WHEN EXISTS (SELECT 1 FROM audit_log a WHERE a.entity_id = s.id::text
                 AND a.action = 'subscription.amountMismatch') THEN 'amount_mismatch'
    WHEN EXISTS (SELECT 1 FROM audit_log a WHERE a.entity_id = s.id::text
                 AND a.action = 'subscription.passRefundDue') THEN
        CASE WHEN EXISTS (SELECT 1 FROM properties p WHERE p.id = s.property_id
                          AND (p.archived OR p.status IN ('rented', 'sold'))) THEN 'listing_gone'
             ELSE 'paid_after_cancel' END
    WHEN EXISTS (SELECT 1 FROM refund_requests r WHERE r.subscription_id = s.id) THEN 'customer_request'
    WHEN EXISTS (SELECT 1 FROM audit_log a WHERE a.entity_id = s.id::text
                 AND a.action = 'subscription.refundedOutside') THEN 'gateway_dashboard'
END
WHERE s.refund_due_at IS NOT NULL;

UPDATE subscriptions s SET refund_settled_at = coalesce(
    (SELECT min(c.issued_at) FROM credit_notes c WHERE c.source_type = 'subscription' AND c.source_id = s.id),
    s.refund_due_at)
WHERE s.refund_ref IS NOT NULL
  AND (s.refund_reason = 'gateway_dashboard'
       OR EXISTS (SELECT 1 FROM credit_notes c WHERE c.source_type = 'subscription' AND c.source_id = s.id));
