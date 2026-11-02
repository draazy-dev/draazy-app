-- NULL deal = usable on any listing. Packs bought before the rent/buy split keep that
-- by moving to a retired untyped row.
ALTER TABLE plans ADD COLUMN deal text CHECK (deal IN ('rent', 'buy'));

INSERT INTO plans (id, name, audience, price, term_days, kind, active, contact_limit, features)
SELECT 'b1000000-0000-4000-8000-000000000009', 'Contact Pack', NULL, 199, 30, 'contact-pack', false, 15,
       '["15 owner contacts", "Valid for 30 days", "No auto-renewal"]'::jsonb
WHERE EXISTS (SELECT 1 FROM plans WHERE id = 'b1000000-0000-4000-8000-000000000006')
ON CONFLICT (id) DO NOTHING;

UPDATE subscriptions SET plan_id = 'b1000000-0000-4000-8000-000000000009'
WHERE plan_id = 'b1000000-0000-4000-8000-000000000006';
