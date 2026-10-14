-- Leads & conversations: contact requests, visits, chat threads, attachments, owner-outreach ledger.

-- One request per (requester, property): check-then-insert in the service races under concurrent double-taps,
-- and a duplicate would double the owner's inbox and break the gate's single-row lookup.
CREATE TABLE contact_requests (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id  uuid NOT NULL REFERENCES properties(id),
    requester_id uuid NOT NULL REFERENCES users(id),
    status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','expired')),
    message      text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    first_requested_at timestamptz NOT NULL DEFAULT now(),
    enquired_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_contact_requests_requester_property UNIQUE (requester_id, property_id)
);
CREATE INDEX idx_contact_requests_property  ON contact_requests (property_id);
CREATE INDEX idx_contact_requests_requester ON contact_requests (requester_id);
CREATE INDEX idx_contact_requests_pending_created ON contact_requests (created_at) WHERE status = 'pending';

COMMENT ON COLUMN contact_requests.first_requested_at IS
    'When the asker first spent this contact. Written once; created_at moves when a pending ask is renewed, this never does, so the quota windows cannot be restarted or recharged by a renewal.';
COMMENT ON COLUMN contact_requests.enquired_at IS
    'When the asker first enquired on the listing. Written once and never moved, not even by a renewal.';

CREATE TABLE visits (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid NOT NULL REFERENCES properties(id),
    visitor_id  uuid NOT NULL REFERENCES users(id),
    slot        timestamptz NOT NULL,
    mode        text NOT NULL DEFAULT 'in-person' CHECK (mode IN ('in-person','video')),
    status      text NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','confirmed','completed','cancelled','no-show')),
    note        text,
    version     bigint NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    -- Set on the owner's first confirmation, never cleared: a visit cancelled later keeps its contact spent.
    confirmed_at timestamptz
);

comment on column visits.version is
    'Optimistic-locking counter (D146). Maintained by Hibernate; raw SQL updates bypass it.';

CREATE INDEX idx_visits_property ON visits (property_id);
CREATE INDEX idx_visits_visitor  ON visits (visitor_id);

-- Composite (scope, created_at DESC) serves the paged `order by created_at desc limit ?` reads without a sort;
-- the direction is spelled out so the index matches the repository's ORDER BY.
CREATE INDEX idx_visits_property_created ON visits (property_id, created_at DESC);
CREATE INDEX idx_visits_visitor_created  ON visits (visitor_id, created_at DESC);

-- Partial unique on live rows only: a cancelled visit must be rebookable, and the service check alone races.
CREATE UNIQUE INDEX uq_visits_live_per_user_property
    ON visits (visitor_id, property_id)
    WHERE status IN ('scheduled', 'confirmed');

-- Pair is canonical (user_a < user_b) so the unique indexes cover both directions; group threads store no pair.
-- `flatmate_group_id` takes its foreign key in the flatmates file, once `flatmate_groups` exists.
CREATE TABLE conversations (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id    uuid REFERENCES users(id),
    user_b_id    uuid REFERENCES users(id),
    property_id  uuid REFERENCES properties(id),
    last_message text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    flatmate_group_id uuid UNIQUE,
    CONSTRAINT conversations_shape CHECK (
        (flatmate_group_id IS NULL
            AND user_a_id IS NOT NULL AND user_b_id IS NOT NULL AND user_a_id < user_b_id)
        OR (flatmate_group_id IS NOT NULL
            AND user_a_id IS NULL AND user_b_id IS NULL AND property_id IS NULL))
);

-- Two indexes: Postgres treats NULLs as distinct in a unique index, so one would allow many property-less pairs.
-- NULLS NOT DISTINCT would fold them into one but needs PG15+.
CREATE UNIQUE INDEX uq_conversations_pair_property
    ON conversations (user_a_id, user_b_id, property_id) WHERE property_id IS NOT NULL;
CREATE UNIQUE INDEX uq_conversations_pair_general
    ON conversations (user_a_id, user_b_id) WHERE property_id IS NULL;

CREATE INDEX idx_conversations_a_recent ON conversations (user_a_id, updated_at DESC);
CREATE INDEX idx_conversations_b_recent ON conversations (user_b_id, updated_at DESC);

CREATE TABLE messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    author_id       uuid NOT NULL REFERENCES users(id),
    author_role     text CHECK (author_role IN ('buyer','owner','staff','manager','admin')),
    body            text NOT NULL,
    attachments     jsonb NOT NULL DEFAULT '[]'::jsonb,
    read            boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    client_id       text,
    reply_to_id     uuid REFERENCES messages(id),
    delivered_at    timestamptz
);
CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);

CREATE UNIQUE INDEX uq_messages_client_id
    ON messages (conversation_id, author_id, client_id)
    WHERE client_id IS NOT NULL;

CREATE INDEX idx_messages_reply_to ON messages (reply_to_id);

CREATE INDEX idx_messages_undelivered_pair
    ON messages (conversation_id, author_id)
    WHERE delivered_at IS NULL;

-- Partial: read messages are the vast majority and can never match the unread-badge query.
CREATE INDEX idx_messages_unread ON messages (conversation_id, author_id) WHERE read = false;

-- messages.read has one reader per message, which a group does not. Group unread is instead every
-- message by someone else newer than the reader's cursor.
CREATE TABLE conversation_reads (
    conversation_id uuid        NOT NULL REFERENCES conversations (id),
    user_id         uuid        NOT NULL REFERENCES users (id),
    read_at         timestamptz NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE hidden_conversation_messages (
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id      uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);

CREATE INDEX idx_hidden_conversation_messages_thread
    ON hidden_conversation_messages (conversation_id, user_id);

CREATE TABLE user_blocks (
    blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT ck_user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

-- Shared by chat and support threads: thread_id points at two tables so it has no FK; the surface CHECK closes the set.
-- message_id stays null until the reply binds it (upload precedes the message) and is never cleared once set.

create table message_attachments (
    id            uuid primary key default gen_random_uuid(),
    surface       text not null check (surface in ('conversation', 'support_ticket')),
    thread_id     uuid not null,
    message_id    uuid,
    uploaded_by   uuid not null references users (id) on delete cascade,
    storage_key   text not null unique,
    content_type  text not null,
    size_bytes    bigint not null check (size_bytes > 0),
    -- RETAINED in ErasureCoverageTest: blanking it would corrupt the counterparty's copy of the exchange.
    file_name     text not null,
    created_at    timestamptz not null default now()
);

create index idx_message_attachments_message on message_attachments (message_id)
    where message_id is not null;

-- Serves the reply handler's lookup of unbound uploads and the per-thread pending cap count.
create index idx_message_attachments_pending on message_attachments (thread_id, uploaded_by)
    where message_id is null;

-- `id` is a slug referenced by name in code and audit rows; retire via `active`, never delete (FK target).
create table message_template (
    id          text primary key,
    channel     text        not null check (channel in ('whatsapp', 'sms', 'email')),
    category    text        not null check (category in ('onboarding', 'reminder', 'notification', 'advice', 'verification')),
    name        text        not null,
    body        text        not null,
    active      boolean     not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index idx_message_template_channel on message_template (channel) where active;

-- `body` and `recipient_mobile` are snapshots: re-resolving them later would misreport what the owner was sent.
-- subject_id has no FK (it can point at several tables); the subject_type CHECK stops rows pointing at nothing.

create table outbound_message (
    id               uuid        primary key default gen_random_uuid(),
    channel          text        not null check (channel in ('whatsapp', 'sms', 'email')),
    template_id      text        references message_template (id),
    subject_type     text        not null check (subject_type in ('property')),
    subject_id       uuid        not null,
    recipient_id     uuid        not null references users (id),
    recipient_mobile text        not null,
    body             text        not null,
    -- `prepared`, not `sent`: click-to-chat is handed to a human and the server cannot witness the send.
    status           text        not null default 'prepared' check (status in ('prepared', 'sent', 'failed')),
    prepared_by      uuid        not null references users (id),
    -- clock_timestamp(), not now(): two chasers in one transaction would tie on now() and the log order be arbitrary.
    prepared_at      timestamptz not null default clock_timestamp(),
    sent_at          timestamptz,
    failure_reason   text
);

create index idx_outbound_message_subject on outbound_message (subject_type, subject_id, prepared_at desc);

CREATE TABLE conversation_user_state (
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    archived        boolean NOT NULL DEFAULT false,
    muted           boolean NOT NULL DEFAULT false,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conversation_user_state_user
    ON conversation_user_state (user_id, muted, archived);

SELECT install_updated_at_triggers();
