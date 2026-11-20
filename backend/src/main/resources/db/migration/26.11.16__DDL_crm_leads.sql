-- Staff Leads CRM: one lead per person (keyed on mobile), one owning staff member, every signal attached.

-- One profile per mobile: who the person is, what they offer or want, and where we found them.
CREATE TABLE crm_leads (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile             text NOT NULL UNIQUE CHECK (mobile ~ '^[6-9][0-9]{9}$'),
    user_id            uuid REFERENCES users(id) ON DELETE SET NULL,
    name               text,
    stage              text NOT NULL DEFAULT 'new'
                         CHECK (stage IN ('new', 'contacted', 'interested', 'converted', 'lost',
                                          'not-reachable', 'do-not-call')),
    owner_id           uuid REFERENCES users(id),
    claimed_at         timestamptz,
    next_follow_up_at  timestamptz,
    last_contact_at    timestamptz,
    last_activity_at   timestamptz,
    failed_attempts    integer NOT NULL DEFAULT 0,
    interests          text[] NOT NULL DEFAULT '{}',
    last_signal_at     timestamptz NOT NULL DEFAULT now(),
    version            bigint NOT NULL DEFAULT 0,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    lead_type          text CHECK (lead_type IN ('owner', 'seeker', 'flatmate')),
    intent             text CHECK (intent IN ('sell', 'rent-out', 'buy', 'rent', 'has-room', 'needs-room')),
    property_types     text[] NOT NULL DEFAULT '{}',
    bhk                text[] NOT NULL DEFAULT '{}',
    localities         text CHECK (char_length(localities) <= 200),
    budget             bigint CHECK (budget > 0),
    lead_source        text CHECK (lead_source IN ('walk-in', 'inbound-call', 'whatsapp', 'facebook',
                                                   'instagram', 'referral', 'flyer', 'draazy', 'portal',
                                                   'other')),
    source_detail      text CHECK (char_length(source_detail) <= 120)
);

CREATE INDEX idx_crm_leads_owner_stage ON crm_leads (owner_id, stage);
CREATE INDEX idx_crm_leads_stage_signal ON crm_leads (stage, last_signal_at DESC);
CREATE INDEX idx_crm_leads_user ON crm_leads (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_crm_leads_type ON crm_leads (lead_type, last_signal_at DESC);

-- (source, source_ref) is the idempotency key: a sweep that sees the same row twice inserts it once.
-- A signal with no lead marks a feed row the intake rejected for good, so the feed stops re-selecting it.
CREATE TABLE crm_lead_signals (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    uuid REFERENCES crm_leads(id) ON DELETE CASCADE,
    source     text NOT NULL
                 CHECK (source IN ('rent-agreement', 'unpaid-checkout', 'quote-request', 'lease-ending', 'manual',
                                   'flatmate')),
    source_ref text NOT NULL,
    service    text,
    summary    text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_lead_signals_ref UNIQUE (source, source_ref)
);

CREATE INDEX idx_crm_lead_signals_lead ON crm_lead_signals (lead_id, created_at DESC);

-- actor_id is null for system actions such as the idle release.
CREATE TABLE crm_lead_activities (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    uuid NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
    actor_id   uuid REFERENCES users(id),
    kind       text NOT NULL
                 CHECK (kind IN ('call', 'whatsapp', 'sms', 'note', 'stage', 'assign', 'claim', 'release',
                                 'reveal', 'convert', 'profile')),
    outcome    text,
    body       text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_lead_activities_lead ON crm_lead_activities (lead_id, created_at DESC);
CREATE INDEX idx_crm_lead_activities_actor ON crm_lead_activities (actor_id, created_at);

-- One paid request credits at most one lead, at most once.
CREATE TABLE crm_lead_conversions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id            uuid NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
    service_request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
    amount             numeric,
    service            text,
    credited_to        uuid NOT NULL REFERENCES users(id),
    converted_by       uuid REFERENCES users(id),
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_lead_conversions_lead ON crm_lead_conversions (lead_id);
CREATE INDEX idx_crm_lead_conversions_credit ON crm_lead_conversions (credited_to, created_at);

SELECT install_updated_at_triggers();
