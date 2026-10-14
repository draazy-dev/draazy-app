-- Engagement, billing and growth. Order matters: plans, service_offerings and support_tickets precede
-- their dependants because each FK must resolve at CREATE time.

CREATE TABLE saved_properties (
    user_id     uuid NOT NULL REFERENCES users(id),
    property_id uuid NOT NULL REFERENCES properties(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, property_id)
);

-- PK (user_id, property_id) is what makes a save idempotent (ON CONFLICT DO NOTHING); the list sort has its own index.
CREATE INDEX idx_saved_properties_user_created
    ON saved_properties (user_id, created_at DESC);

-- `kind` splits listings alerts (URL `query`) from flatmates alerts (structured `criteria`); `query` cannot hold both.
CREATE TABLE saved_searches (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id),
    name            text,

    -- `query` is nullable: it is required only for listings alerts, enforced by ck_saved_searches_payload.
    query           text,
    filters         jsonb NOT NULL DEFAULT '{}'::jsonb,

    alert_frequency text NOT NULL DEFAULT 'daily' CHECK (alert_frequency IN ('off','instant','daily','weekly')),

    -- `sms` must stay in the channel vocabulary (API contract), or an SMS alert 500s on the CHECK instead of a 422.
    channel         text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','sms','email','push')),

    new_count       integer NOT NULL DEFAULT 0,

    kind            text NOT NULL DEFAULT 'listings' CHECK (kind IN ('listings','flatmates')),
    criteria        jsonb,
    label           text,
    mobile          text CHECK (mobile IS NULL OR mobile ~ '^[6-9][0-9]{9}$'),

    -- Nullable with no backfill: NULL means never fired and is treated as due, so existing alerts are not suppressed.
    -- `updated_at` cannot serve as the clock: the sweep rewrites it whenever new_count changes.
    last_alerted_at timestamptz,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_saved_searches_payload
        CHECK ((kind = 'listings'  AND query IS NOT NULL)
            OR (kind = 'flatmates' AND criteria IS NOT NULL))
);

-- Per-user lists sort by created_at DESC, so the key carries it (api-standards.md section 5: every sort index-backed).
-- A bare user_id index would be a redundant prefix of it.
CREATE INDEX idx_saved_searches_user_created
    ON saved_searches (user_id, created_at DESC);

CREATE INDEX idx_saved_searches_kind ON saved_searches (user_id, kind);

COMMENT ON COLUMN saved_searches.last_alerted_at IS
    'When this saved search last sent its owner a match alert. Null = never fired; the cadence in alert_frequency is measured from here, not from updated_at.';

-- Capped at six rows per user holding only a label and our own relative URL: no IP, UA or opened listings.
-- Not saved_searches: a recent search is silently evicted, an alert is a standing user instruction.
CREATE TABLE recent_searches (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- No ON DELETE CASCADE: users are soft-deleted and erased via User.erasePersonalData, so no hard delete exists.
    user_id     uuid NOT NULL REFERENCES users(id),

    -- Presentation only, not the row identity: two different searches can render the same label.
    label       varchar(200) NOT NULL,

    -- The row identity: a relative URL checked against a path allowlist at the service, capped under the index limit.
    url         varchar(500) NOT NULL,

    -- Not updated_at: Hibernate skips an UPDATE when values are unchanged, which would leave the MRU order stale.
    searched_at timestamptz NOT NULL DEFAULT now(),

    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Keyed on URL, not label (different searches can share a chip label); also bounds the rail read to six rows pre-sort.
CREATE UNIQUE INDEX uq_recent_searches_user_url ON recent_searches (user_id, url);

CREATE TABLE plans (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    audience      text CHECK (audience IN ('owner','tenant','buyer')),
    price         bigint NOT NULL DEFAULT 0,
    billing_cycle text CHECK (billing_cycle IN ('monthly','quarterly','yearly')),
    features      jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- NULL listing_limit is not "no cap": the free-tier floor of one applies, so an uncapped plan states a big number.
    -- NULL contact_limit means no ceiling (the client treats !Number.isFinite as unlimited).
    listing_limit integer,
    contact_limit integer,

    -- Entitlement flag, apart from display-only contact_limit (NULL there means two things); keyed on seeded ids, not
    -- price > 0, so a free promo keeps it. R__seed_reference_data.sql inserts plans with it already set.
    unlimited_contacts boolean NOT NULL DEFAULT false,

    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    kind          text NOT NULL DEFAULT 'plan' CHECK (kind IN ('plan', 'listing-pass', 'contact-pack')),
    term_days     integer CHECK (term_days > 0),
    active        boolean NOT NULL DEFAULT true,

    -- A listing pass carries no listing number of its own: it covers the one property it is bound to.
    CONSTRAINT plans_owner_states_listing_limit
        CHECK (audience IS DISTINCT FROM 'owner' OR kind <> 'plan' OR listing_limit IS NOT NULL)
);

COMMENT ON COLUMN plans.listing_limit IS
    'Live listings this plan grants. NULL is NOT unlimited: the plan grants no listing allowance of its own and the free-tier floor of one applies. An effectively uncapped plan must state a large number. Required on owner plans (plans_owner_states_listing_limit).';
COMMENT ON COLUMN plans.kind IS
    'plan = the retired subscription tiers, honoured until they lapse; listing-pass = one extra live '
    'listing for one property; contact-pack = a stackable bundle of owner contacts.';
COMMENT ON COLUMN plans.term_days IS
    'Paid term in days from payment. When set it overrides billing_cycle.';
COMMENT ON COLUMN plans.active IS
    'False once retired from sale; subscriptions already bought stay honoured.';

-- `pending` records a checkout opened but not completed; activating on POST would hand out the plan to abandoners.
CREATE TABLE subscriptions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id),
    plan_id    uuid NOT NULL REFERENCES plans(id),
    status     text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'past-due', 'cancelled', 'expired',
                                   'refund-review', 'refunded', 'disputed')),
    started_at timestamptz NOT NULL DEFAULT now(),
    renews_at  timestamptz,

    -- Gateway order id the payment webhook matches on, so unique; the index is partial as a free plan creates no order.
    payment_ref text,

    -- Client Idempotency-Key, per user: the only thing telling a double-tapped Subscribe from a deliberate repurchase.
    idempotency_key text,

    version    bigint NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Amount actually charged, not today's plan price (plans is reseeded). NOT NULL without default so a missing price
    -- cannot become a plausible zero.
    amount bigint NOT NULL,
    property_id uuid REFERENCES properties(id),
    refund_due_at timestamptz,
    refund_ref text,
    refund_attempts integer NOT NULL DEFAULT 0,
    refund_amount bigint,
    payment_instrument_hash text,
    frozen_at timestamptz,
    refund_tried_at timestamptz,
    CONSTRAINT ck_subscriptions_amount_non_negative CHECK (amount >= 0)
);

CREATE UNIQUE INDEX uq_subscriptions_payment_ref
    ON subscriptions (payment_ref) WHERE payment_ref IS NOT NULL;

CREATE UNIQUE INDEX uq_subscriptions_idempotency
    ON subscriptions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_subscriptions_user_started ON subscriptions (user_id, started_at DESC);

-- One unpaid order per user, mirroring uq_service_requests_open_unpaid; only a unique index holds under concurrency.
-- Must match SubscriptionService.MAX_OPEN_UNPAID_PER_USER = 1; not CONCURRENTLY since Flyway runs in a transaction.
CREATE UNIQUE INDEX uq_subscriptions_open_unpaid
    ON subscriptions (user_id)
    WHERE status = 'pending';

COMMENT ON COLUMN subscriptions.version IS
    'Optimistic-locking counter (D161). Maintained by Hibernate; raw SQL updates bypass it.';

CREATE INDEX idx_subscriptions_property ON subscriptions (property_id) WHERE property_id IS NOT NULL;

CREATE INDEX idx_subscriptions_refund_due ON subscriptions (refund_due_at) WHERE refund_ref IS NULL AND refund_due_at IS NOT NULL;

COMMENT ON COLUMN subscriptions.property_id IS
    'The listing a listing pass is bound to; null for every other plan kind.';
COMMENT ON COLUMN subscriptions.refund_due_at IS
    'Set when a payment arrived for an order we had already cancelled or whose listing was no longer live; the money goes back.';
COMMENT ON COLUMN subscriptions.refund_ref IS
    'The gateway refund id once the money has been sent back; null while a refund is still due.';
COMMENT ON COLUMN subscriptions.refund_attempts IS
    'Refunds the gateway reported as failed; each retry needs a fresh gateway refund id, so this suffixes it.';
COMMENT ON COLUMN subscriptions.refund_amount IS
    'Whole rupees to send back when it differs from amount: the provider reported a different sum than the order was for. Null refunds amount.';
COMMENT ON COLUMN subscriptions.payment_instrument_hash IS
    'Salted hash of the card or UPI id the gateway reported for the payment; links accounts that share an instrument.';
COMMENT ON COLUMN subscriptions.frozen_at IS
    'When the order stopped entitling for a refund review or a dispute; the term is pushed out by this long when it is restored.';
COMMENT ON COLUMN subscriptions.refund_tried_at IS
    'When the gateway last refused this refund; the sweep tries untried and least recently refused refunds first.';

-- Optimistic lock: the checkout sweep and payment webhook both write unpaid rows; the sweep must not cancel a paid one.
-- `default 0 not null` is required: @Version maps to a primitive long, and a nullable version is an optional lock.
CREATE TABLE service_offerings (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name           text NOT NULL,
    category       text,
    starting_price bigint,
    description    text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- `quoted` is where amount is set; placed/scheduled/in-progress keep the spellings of the ServiceOrder enum.
-- Legal moves live in ServiceOrderStatuses (a CHECK cannot see the old value); no payment columns, amount is quoted.
CREATE TABLE service_orders (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    offering_id   uuid NOT NULL REFERENCES service_offerings(id),
    user_id       uuid NOT NULL REFERENCES users(id),
    property_id   uuid REFERENCES properties(id),
    status        text NOT NULL DEFAULT 'placed'
                    CHECK (status IN ('placed','quoted','scheduled','in-progress','completed','cancelled')),
    amount        bigint,
    scheduled_for timestamptz,
    notes         text,
    idempotency_key text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_service_orders_idempotency
    ON service_orders (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_service_orders_user_created ON service_orders (user_id, created_at DESC);

-- `staff_unread` is a second boolean beside `unread` (customer signal): overloading one would break the badge.
-- Two booleans, not read timestamps or a read table: there are exactly two sides and the contract ships a boolean.
CREATE TABLE support_tickets (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id),
    subject    text NOT NULL,
    category   text,
    status     text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','in-progress','waiting','resolved','closed')),
    unread     boolean NOT NULL DEFAULT false,
    staff_unread boolean NOT NULL DEFAULT false,

    -- Optimistic-locking counter; why default 0 / not null matter is beside `tickets` in the service-requests file.
    version    bigint NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_user_created ON support_tickets (user_id, created_at DESC);

-- The platform-wide admin read (order by created_at desc limit ?) is not covered by the per-user index above;
-- without this, every page sorts the whole table.
CREATE INDEX idx_support_tickets_created
    ON support_tickets (created_at DESC);

-- Partial on staff_unread = true: the awaiting-reply filter is a small, shrinking minority and false is never queried.
CREATE INDEX idx_support_tickets_awaiting_reply
    ON support_tickets (created_at DESC)
 WHERE staff_unread;

COMMENT ON COLUMN support_tickets.staff_unread IS
    'D50: a customer message the desk has not read. The mirror of `unread`, which is the raiser''s '
    'side. The raiser replying sets this; a staff or admin read clears it; a staff reply does not '
    'touch it. Neither column is ever cleared by the other side reading.';

COMMENT ON COLUMN support_tickets.unread IS
    'A support reply the raiser has not read. Set by a staff or admin reply, cleared by '
    'POST /support/tickets/{id}/read called by the raiser. Untouched by the raiser''s own replies, '
    'and since V53 untouched by a staff read as well -- that clears `staff_unread` instead.';

COMMENT ON COLUMN support_tickets.version IS
    'Optimistic-locking counter (D48). Maintained by Hibernate; raw SQL updates bypass it.';

CREATE UNIQUE INDEX uq_support_tickets_open_identity_dispute ON support_tickets (user_id)
    WHERE category = 'identity_dispute' AND status NOT IN ('resolved','closed');

CREATE TABLE support_ticket_messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   uuid NOT NULL REFERENCES support_tickets(id),
    author_id   uuid REFERENCES users(id),
    author_role text CHECK (author_role IN ('buyer','owner','staff','manager','admin')),
    body        text NOT NULL,
    attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_ticket_messages_ticket ON support_ticket_messages (ticket_id, created_at);

CREATE TABLE notifications (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id),
    type       text,
    title      text,
    body       text,
    read       boolean NOT NULL DEFAULT false,
    link       text,

    -- deliver_after NULL means deliverable now; quiet hours defer visibility, never drop the row.
    -- No scheduled job: a now() comparison has no release window and nothing to backfill.
    deliver_after timestamptz,

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, read, created_at DESC);

-- The paged list is "mine, newest first" with no predicate on `read`, which sits mid-key in idx_notifications_user,
-- so that index cannot back the sort; both indexes are needed.
CREATE INDEX idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

-- No index for deliver_after: the OR predicate breaks ordering on the next key column, and the existing
-- idx_notifications_user_created scan with a cheap filter wins while deferred rows are rare.

CREATE UNIQUE INDEX uq_notifications_society_listing
    ON notifications (user_id, link) WHERE type = 'match.society-listing';

COMMENT ON COLUMN notifications.deliver_after IS
    'NULL = deliverable immediately (the overwhelming majority). Set to the end of the recipient''s '
    'quiet-hours window when the notification was written inside one; the inbox read hides the row '
    'until then. The notification is deferred, never suppressed (D94).';

-- referred is often not yet a user, hence mobile text; referrer is an FK with a denormalized mobile for the ops view.
-- Qualifies when the referee's first listing passes the ownership-document gate, the one expensive-to-fake action.
CREATE TABLE referrals (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id      uuid REFERENCES users(id),
    referrer_mobile  text CHECK (referrer_mobile ~ '^[6-9][0-9]{9}$'),
    referred         text,
    referred_mobile  text CHECK (referred_mobile ~ '^[6-9][0-9]{9}$'),
    channel          text CHECK (channel IN ('seeker','owner')),

    -- `reward` is a free-text human label ("+15 owner contacts") and reward_amount its magnitude; decided rows keep
    -- their historical value, which is why reward is not an enum.
    reward           text,

    -- `reward` is prose, so reward_amount holds the number that ReferralSummary.rewardsEarned sums.
    reward_amount    bigint NOT NULL DEFAULT 0,

    -- `clawed-back` differs from `rejected`: never paid versus paid and recovered.
    status           text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'qualified', 'held', 'rewarded', 'rejected', 'clawed-back')),
    risk             text CHECK (risk IN ('low','medium','high')),
    identity_verified boolean NOT NULL DEFAULT false,
    identity_unique   boolean NOT NULL DEFAULT false,

    same_device      boolean NOT NULL DEFAULT false,
    same_ip          boolean NOT NULL DEFAULT false,
    velocity_high    boolean NOT NULL DEFAULT false,
    activated        boolean NOT NULL DEFAULT false,
    at               timestamptz NOT NULL DEFAULT now(),

    handled_by       text,
    handled_at       timestamptz,
    handled_reason   text,

    -- Records which listing qualified the referral, for idempotency and fraud audit; deliberately no FK to properties
    -- so withdrawing or deleting a listing neither erases the evidence nor is blocked by it.
    qualified_at          timestamptz,
    qualified_property_id uuid,

    -- Separate from `channel` (seeker/owner, on the wire and CHECKed); NULL when the share route is unknown.
    share_channel    text CHECK (share_channel IS NULL
                                 OR share_channel IN ('whatsapp', 'sms', 'email', 'copy', 'qr', 'other')),

    -- PERSONAL DATA: salted SHA-256 of IP and User-Agent, never raw (draazy.security.referral-signal-salt); fraud only.
    -- Retention 90 days, cleared in place by ReferralSignalRetentionSweep; the same_device/same_ip findings survive.
    referred_ip_hash     text,
    referred_device_hash text,

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    track                   text CHECK (track IN ('owner', 'seeker')),
    hold_until              timestamptz,
    auto_reason             text,
    granted_at              timestamptz,
    referred_device_id_hash text
);

CREATE INDEX idx_referrals_referrer ON referrals (referrer_id);

-- One referral per referred mobile; partial because a NULL mobile is not a duplicate of anything.
CREATE UNIQUE INDEX uq_referrals_referred_mobile
    ON referrals (referred_mobile) WHERE referred_mobile IS NOT NULL;

CREATE INDEX idx_referrals_queue ON referrals (status, risk, at DESC);
CREATE INDEX idx_referrals_referrer_status ON referrals (referrer_id, status);

-- Partial: most rows never qualify; serves the per-referrer rolling-window cap that counts qualifications.
CREATE INDEX idx_referrals_referrer_qualified
    ON referrals (referrer_id, qualified_at) WHERE qualified_at IS NOT NULL;

CREATE INDEX idx_referrals_held ON referrals (hold_until) WHERE status = 'held';
CREATE INDEX idx_referrals_granted ON referrals (granted_at) WHERE status IN ('qualified', 'rewarded');
CREATE INDEX idx_referrals_qualified_property ON referrals (qualified_property_id)
    WHERE qualified_property_id IS NOT NULL;

COMMENT ON COLUMN referrals.qualified_at IS
    'When the referee''s first listing passed ownership verification (Q17). NULL until it does. '
    'Set exactly once: a second verified listing by the same owner, and re-verification after a '
    'lapse, are both no-ops.';
COMMENT ON COLUMN referrals.qualified_property_id IS
    'Which listing cleared the gate. Evidence, not an association -- no FK, so deleting the listing '
    'neither erases the reason a credit was granted nor is blocked by it.';
COMMENT ON COLUMN referrals.share_channel IS
    'How the referral link reached the referee, as reported at redemption. NULL when unknown, which '
    'includes every code passed on by voice. Distinct from `channel`, which records which side of '
    'the marketplace the referred party joined on.';
COMMENT ON COLUMN referrals.referred_ip_hash IS
    'Salted SHA-256 of the client address the referee redeemed from (IPv6 collapsed to its /64). '
    'PERSONAL DATA. Purpose: referral fraud detection only. Retention 90 days, then blanked by '
    'ReferralSignalRetentionSweep. Never the raw address.';
COMMENT ON COLUMN referrals.referred_device_hash IS
    'Salted SHA-256 of the User-Agent the referee redeemed with. PERSONAL DATA. Purpose: referral '
    'fraud detection only. Retention 90 days, then blanked by ReferralSignalRetentionSweep. Never '
    'the raw header.';

-- Own table, not a users column: the code is growth-context data and billing must not write into identity's aggregate.
-- user_id is the primary key: one permanent code per user, since rotating breaks every shared card and message.
CREATE TABLE referral_codes (
    user_id    uuid PRIMARY KEY REFERENCES users(id),
    code       text NOT NULL UNIQUE,

    -- Referrer digests are stamped once at mint, not on read: no read-path writes, no office-network false matches.
    -- NULL never matches, so older codes read false for both signals; a false negative sends the referral to a human.
    referrer_ip_hash     text,
    referrer_device_hash text,
    signals_at           timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    referrer_device_id_hash text
);

COMMENT ON COLUMN referrals.track IS
    'Which first event decided the reward: owner (first listing verified) or seeker (first contact request accepted). NULL until it happens, and on rows that predate the tracks, which earn owner contacts.';
COMMENT ON COLUMN referrals.hold_until IS
    'While status is held: when the hourly sweep re-checks the referral and either grants or rejects it.';
COMMENT ON COLUMN referrals.auto_reason IS
    'Machine reason for the last automatic decision (system handled_by): high_risk, cap_reached, referee_suspended, listing_taken_down, verification_revoked, clawback_window.';
COMMENT ON COLUMN referrals.granted_at IS
    'When the referral began earning its reward; starts the automatic clawback window.';
COMMENT ON COLUMN referrals.referred_device_id_hash IS
    'Salted SHA-256 of the first-party X-Device-Id the referee redeemed with. PERSONAL DATA. Purpose: referral fraud detection only. Blanked after settings.fees.referralSignalRetentionDays.';

COMMENT ON COLUMN referral_codes.referrer_ip_hash IS
    'Salted SHA-256 of the address the referrer minted their code from (IPv6 collapsed to its /64). '
    'PERSONAL DATA. Purpose: referral fraud detection only. Retention 90 days from signals_at, then '
    'blanked by ReferralSignalRetentionSweep. Never the raw address.';
COMMENT ON COLUMN referral_codes.referrer_device_hash IS
    'Salted SHA-256 of the User-Agent the referrer minted their code with. PERSONAL DATA. Purpose: '
    'referral fraud detection only. Retention 90 days from signals_at, then blanked by '
    'ReferralSignalRetentionSweep. Never the raw header.';
COMMENT ON COLUMN referral_codes.referrer_device_id_hash IS
    'Salted SHA-256 of the first-party X-Device-Id the referrer last opened the referral screen from. PERSONAL DATA. Purpose: referral fraud detection only. Blanked after settings.fees.referralSignalRetentionDays from signals_at.';
COMMENT ON COLUMN referral_codes.signals_at IS
    'When the two digests above were captured. Drives their 90-day retention window; created_at '
    'cannot, because a row may be re-stamped and because it exists on rows that predate V64.';

-- A frozen order is entitled to nothing, so 'refund-review' and 'disputed' sit outside the entitled statuses.
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
    issued_at      timestamptz NOT NULL DEFAULT now(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    invoice_no     text,
    CONSTRAINT uq_credit_notes_source UNIQUE (source_type, source_id)
);
CREATE INDEX idx_credit_notes_user ON credit_notes (user_id, issued_at DESC);
COMMENT ON COLUMN credit_notes.amount IS
    'Whole rupees refunded; taxable_amount is Draazy''s own fee, the rest is statutory pass-through.';
COMMENT ON COLUMN credit_notes.invoice_no IS 'The invoice this note credits, when the order had one.';

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
COMMENT ON COLUMN payment_disputes.frozen_from IS
    'The subscription status this dispute froze, restored when the dispute is won; null when nothing was frozen.';
COMMENT ON COLUMN payment_disputes.listing_paused IS
    'True when freezing the order paused its listing, so winning the dispute resumes it.';

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
    issued_at      timestamptz   NOT NULL,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_invoices_source UNIQUE (source_type, source_id)
);
CREATE INDEX idx_invoices_user ON invoices (user_id, issued_at DESC);
COMMENT ON TABLE invoices IS 'One invoice per successful payment, numbered per financial year. Whole rupees.';
COMMENT ON COLUMN invoices.amount IS
    'What the customer paid; taxable_amount is Draazy''s own fee, the rest is statutory pass-through.';

-- Every migration ends by (re)wiring trg_set_updated_at onto each table that has an `updated_at` column.
SELECT install_updated_at_triggers();
