ALTER TABLE plans
    ADD COLUMN kind text NOT NULL DEFAULT 'plan' CHECK (kind IN ('plan', 'listing-pass', 'contact-pack')),
    ADD COLUMN term_days integer CHECK (term_days > 0),
    ADD COLUMN active boolean NOT NULL DEFAULT true;

UPDATE plans SET audience = NULL WHERE audience = 'agent';
ALTER TABLE plans DROP CONSTRAINT plans_audience_check;
ALTER TABLE plans ADD CONSTRAINT plans_audience_check
    CHECK (audience IN ('owner', 'tenant', 'buyer'));

-- A listing pass carries no listing number of its own: it covers the one property it is bound to.
ALTER TABLE plans DROP CONSTRAINT plans_owner_states_listing_limit;
ALTER TABLE plans ADD CONSTRAINT plans_owner_states_listing_limit
    CHECK (audience IS DISTINCT FROM 'owner' OR kind <> 'plan' OR listing_limit IS NOT NULL);

ALTER TABLE subscriptions ADD COLUMN property_id uuid REFERENCES properties(id);

CREATE INDEX idx_subscriptions_property ON subscriptions (property_id) WHERE property_id IS NOT NULL;

COMMENT ON COLUMN plans.kind IS
    'plan = the retired subscription tiers, honoured until they lapse; listing-pass = one extra live '
    'listing for one property; contact-pack = a stackable bundle of owner contacts.';
COMMENT ON COLUMN plans.term_days IS
    'Paid term in days from payment. When set it overrides billing_cycle.';
COMMENT ON COLUMN plans.active IS
    'False once retired from sale; subscriptions already bought stay honoured.';
COMMENT ON COLUMN subscriptions.property_id IS
    'The listing a listing pass is bound to; null for every other plan kind.';

UPDATE plans SET active = false
    WHERE id IN ('b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
                 'b1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000004');

DELETE FROM platform_fees WHERE deal = 'buy';

UPDATE settings
    SET value = (value - 'ownerPlanYearly' - 'ownerProYearly' - 'seekerPlusTopup')
                || '{"listingPass": 999, "contactPack": 199, "rentAgreementPlatform": 499}'::jsonb
    WHERE key = 'fees';
