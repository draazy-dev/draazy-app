-- Deals, offers, finalization and the property verification case file.

CREATE TABLE offers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id  uuid NOT NULL REFERENCES properties(id),
    from_user_id uuid NOT NULL REFERENCES users(id),
    amount       bigint NOT NULL,
    status       text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','countered','accepted','declined','withdrawn')),
    message      text,
    -- Nullable `date` like `tenant_profiles.move_in`: a calendar day, and an offer may open on price alone.
    move_in      date,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_offers_property ON offers (property_id);
CREATE INDEX idx_offers_from     ON offers (from_user_id);

CREATE TABLE offer_history (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id uuid NOT NULL REFERENCES offers(id),
    amount   bigint NOT NULL,
    by       text NOT NULL CHECK (by IN ('buyer','owner')),
    at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_offer_history_offer ON offer_history (offer_id, at);

CREATE TABLE deals (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id    uuid NOT NULL REFERENCES properties(id),
    deal           text NOT NULL CHECK (deal IN ('buy','rent')),
    -- Set only when counterparty_mobile resolves to a registered user; off-platform buyers are the common case.
    -- finalization_requests.counterparty_id stays NOT NULL: finalization needs the counterparty to sign in and accept.
    counterparty_id uuid REFERENCES users(id),
    counterparty_mobile text,
    note           text,
    agreed_price   bigint,
    status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reserved','closed')),
    closed_at      timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deals_property ON deals (property_id);
CREATE INDEX idx_deals_status   ON deals (status);

-- One deal per property: the API addresses "the deal on this listing" positionally, and a create-on-first-write race
-- would otherwise fork a listing into two deals.
CREATE UNIQUE INDEX uq_deals_property ON deals (property_id);

-- Not a users FK: parties are off-platform people the owner jotted down, unlike deals.counterparty_id.
-- Not jsonb on deals: DELETE .../parties/{partyId} needs a stable per-row identity.
CREATE TABLE deal_parties (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id    uuid NOT NULL REFERENCES deals(id),
    name       text NOT NULL,
    mobile     text,
    note       text,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deal_parties_deal ON deal_parties (deal_id, created_at)
    WHERE deleted_at IS NULL;

CREATE TABLE finalization_requests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     uuid NOT NULL REFERENCES properties(id),
    initiator_id    uuid NOT NULL REFERENCES users(id),
    counterparty_id uuid NOT NULL REFERENCES users(id),
    agreed_price    bigint NOT NULL,
    status          text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','declined','cancelled')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_finalization_property ON finalization_requests (property_id);

-- Partial unique on live rows only: a declined offer must be re-offerable, and the service check alone races.
CREATE UNIQUE INDEX uq_offers_live_per_user_property
    ON offers (from_user_id, property_id)
    WHERE status IN ('pending', 'countered');

CREATE UNIQUE INDEX uq_finalization_live_per_user_property
    ON finalization_requests (initiator_id, property_id)
    WHERE status = 'pending';

-- Composite (scope, created_at DESC) serves the paged `order by created_at desc limit ?` reads without a sort;
-- the direction is spelled out so the index matches the repository's ORDER BY.

CREATE INDEX idx_offers_property_created ON offers (property_id, created_at DESC);
CREATE INDEX idx_offers_from_created     ON offers (from_user_id, created_at DESC);

CREATE INDEX idx_deals_property_created  ON deals (property_id, created_at DESC);

-- Partial: `findPendingByCounterparty` reads only pending rows; the other statuses accumulate and are never selected.
CREATE INDEX idx_finalization_counterparty_created
    ON finalization_requests (counterparty_id, created_at DESC)
    WHERE status = 'pending';

CREATE TABLE property_reviews (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid NOT NULL UNIQUE REFERENCES properties(id),
    status      text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','needs_info','approved','rejected','flagged','archived')),
    reviewer    text,
    notes       text,
    decided_at  timestamptz,
    -- Bumped on every message (child inserts leave updated_at untouched); NOT NULL, created_at until the first message,
    -- so the queue sorts on one bare column plus id that an index can match, with a unique tiebreak for paging.
    last_message_at timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    reason_code text,
    needs_info_day2_reminded_at timestamptz,
    needs_info_day7_reminded_at timestamptz,
    needs_info_timeout_archived_at timestamptz,
    CONSTRAINT ck_property_reviews_reason_code
        CHECK (reason_code IS NULL OR reason_code IN (
            'photos_not_real',
            'duplicate',
            'broker',
            'wrong_details',
            'locality_unclear',
            'document_unreadable',
            'name_mismatch',
            'other'
        ))
);

-- Matches `order by last_message_at desc, id desc` term for term so it can serve as an ordering index.
CREATE INDEX idx_property_reviews_activity
    ON property_reviews (last_message_at DESC, id DESC);

CREATE TABLE property_review_checklist (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id uuid NOT NULL REFERENCES property_reviews(id),
    item      text NOT NULL,
    pass      boolean NOT NULL DEFAULT false,
    checked_by uuid,
    checked_at timestamptz
);
CREATE INDEX idx_review_checklist_review ON property_review_checklist (review_id);

CREATE TABLE review_messages (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id  uuid NOT NULL REFERENCES property_reviews(id),
    sender_id  uuid REFERENCES users(id),
    body       text NOT NULL,
    -- Per-message nullable timestamp: the UI asks "which messages are new", which a thread-wide mark cannot answer.
    read_at    timestamptz,
    -- Staff-only: a duplicate-probe finding posted to the owner's thread would be an oracle for electricity_meter_no.
    -- NOT NULL so `internal = false` cannot silently drop NULL rows from the owner's thread.
    internal   boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    clarification_requested boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_review_messages_review ON review_messages (review_id, created_at);

CREATE INDEX idx_review_messages_review_at ON review_messages (review_id, created_at);

CREATE INDEX idx_review_messages_unread ON review_messages (review_id) WHERE read_at IS NULL;

CREATE INDEX idx_review_messages_owner_unread ON review_messages(review_id)
    WHERE NOT internal AND read_at IS NULL;

COMMENT ON COLUMN review_messages.read_at IS
  'When the *other* participant read this message; null = unread. Set by POST /properties/{id}/verification/read.';

COMMENT ON COLUMN review_messages.internal IS
    'True for staff-only notes, hidden from the listing owner. See V80.';

SELECT install_updated_at_triggers();
