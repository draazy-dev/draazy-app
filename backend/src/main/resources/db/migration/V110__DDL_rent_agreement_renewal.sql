ALTER TABLE rent_agreements ADD COLUMN renewal_reminded_at timestamptz;
COMMENT ON COLUMN rent_agreements.renewal_reminded_at IS
    'When the daily sweep told the parties this agreement is ending; null until then, so the reminder goes out once.';

UPDATE settings
   SET value = value || '{"gstPercent": 0}'::jsonb
 WHERE key = 'fees';

UPDATE platform_fees SET gst = 0 WHERE deal = 'rent';
