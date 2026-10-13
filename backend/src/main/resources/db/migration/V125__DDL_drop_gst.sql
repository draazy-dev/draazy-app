UPDATE invoices SET taxable_amount = taxable_amount + gst_amount WHERE gst_amount > 0;
UPDATE credit_notes SET taxable_amount = taxable_amount + gst_amount WHERE gst_amount > 0;

ALTER TABLE invoices DROP COLUMN gst_amount, DROP COLUMN gst_percent;
ALTER TABLE credit_notes DROP COLUMN gst_amount, DROP COLUMN gst_percent;
ALTER TABLE platform_fees DROP COLUMN gst;

UPDATE settings SET value = value - 'gstPercent' WHERE key = 'fees' AND value ? 'gstPercent';
UPDATE settings SET value = value - 'gst' WHERE key = 'site' AND value ? 'gst';
UPDATE properties SET form_details = form_details - 'gstOnRent' WHERE form_details ? 'gstOnRent';

COMMENT ON TABLE invoices IS 'One invoice per successful payment, numbered per financial year. Whole rupees.';
COMMENT ON COLUMN invoices.amount IS
    'What the customer paid; taxable_amount is Draazy''s own fee, the rest is statutory pass-through.';
COMMENT ON COLUMN credit_notes.amount IS
    'Whole rupees refunded; taxable_amount is Draazy''s own fee, the rest is statutory pass-through.';
COMMENT ON COLUMN credit_notes.invoice_no IS 'The invoice this note credits, when the order had one.';
COMMENT ON COLUMN service_requests.referral_credit IS
    'True once a referral-earned free rent agreement was spent on this request, which waives only '
    'Draazy''s own service fee. A credit is held while the request is anything but cancelled.';
