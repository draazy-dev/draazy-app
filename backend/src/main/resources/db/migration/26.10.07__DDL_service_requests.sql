-- Service requests, ops queues & moderation: tickets, service requests with their audit trail, reports, notes.

-- Optimistic locking on the ops work queues: two staff saving one row would silently drop the earlier edit.
-- `version` is NOT NULL DEFAULT 0: @Version maps a primitive long, so a null would read as a detached entity.

CREATE TABLE tickets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject      text NOT NULL,
    team         text CHECK (team IN ('rental','legal','loans','interior','packers','valuation')),
    priority     text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
    status       text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','in-progress','waiting','resolved','closed')),
    property_id  uuid REFERENCES properties(id),
    requester_id uuid REFERENCES users(id),
    assignee_id  uuid REFERENCES users(id),
    service      text,
    customer     text,
    mobile       text CHECK (mobile ~ '^[6-9][0-9]{9}$'),
    value        bigint,
    detail       text,

    version      bigint NOT NULL DEFAULT 0,

    -- Customer-accepted quote, kept apart from ops' `value` estimate; no backfill, which would assume they were equal.
    -- The CHECK lives here because a client writes this column; `value` is left unconstrained (existing data).
    quoted_value bigint,
    CONSTRAINT tickets_quoted_value_check CHECK (quoted_value is null or quoted_value >= 0),

    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_team_status ON tickets (team, status);
CREATE INDEX idx_tickets_assignee    ON tickets (assignee_id);

CREATE INDEX idx_tickets_created ON tickets (created_at DESC);

-- Serves the per-mobile rate-limit count on the unauthenticated waitlist path and the (mobile, subject, status) check.
-- Not partial: a partial index is a footgun for queries that do not repeat the predicate.
CREATE INDEX idx_tickets_mobile_created ON tickets (mobile, created_at DESC);

COMMENT ON COLUMN tickets.version IS
    'Optimistic-locking counter (D48). Maintained by Hibernate; raw SQL updates bypass it.';

CREATE TABLE ticket_notes (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES tickets(id),
    by        text,
    text      text NOT NULL,
    at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_notes_ticket ON ticket_notes (ticket_id, at);

CREATE TABLE service_requests (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid REFERENCES users(id),

    -- Closed vocabulary: pricing matches `type` exactly, so a misspelt value created an unpaid rent agreement.
    -- ServiceRequestTypes.isKnown is the 400; this CHECK is the enforcement a future caller cannot bypass.
    type         text NOT NULL
                   CONSTRAINT service_requests_type_check
                   CHECK (type IN ('rent-agreement', 'legal', 'interior', 'packers', 'valuation')),

    -- `awaiting-payment`: filed but unpaid, hidden from ops until the payment webhook moves it (the only exit).
    -- `changes-requested` is distinct from `in-progress` so a rejected draft is visible to customer and operator.
    status       text NOT NULL DEFAULT 'new'
                   CHECK (status IN ('awaiting-payment', 'new', 'assigned', 'in-progress', 'draft-shared',
                                     'changes-requested', 'approved', 'completed', 'cancelled')),

    property_id  uuid REFERENCES properties(id),
    assignee_id  uuid REFERENCES users(id),

    details      jsonb,

    version      bigint NOT NULL DEFAULT 0,

    amount       bigint,

    payment_ref  text,

    -- NOT NULL, no DEFAULT: the CHECK pairs team to type totally, so a new service type cannot be added without a desk.
    -- Mirrors ServiceRequestTypes.teamFor; 'rent-agreement' is worked by the rental team, the others share their name.
    team         text NOT NULL,

    -- FK points up at the ticket (created first; the request knows it at INSERT); the unique index below makes it 1:1.
    ticket_id    uuid REFERENCES tickets(id),

    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    status_changed_at timestamptz NOT NULL DEFAULT now(),
    referral_credit boolean NOT NULL DEFAULT false,

    CONSTRAINT service_requests_type_team_check
        CHECK ((type, team) IN (
            ('rent-agreement', 'rental'),
            ('legal',          'legal'),
            ('interior',       'interior'),
            ('packers',        'packers'),
            ('valuation',      'valuation')
        ))
);

CREATE INDEX idx_service_requests_status ON service_requests (status);

CREATE INDEX idx_service_requests_requester
    ON service_requests (requester_id, created_at DESC);

CREATE INDEX idx_service_requests_type_created
    ON service_requests (type, created_at DESC);

CREATE INDEX idx_service_requests_team_status ON service_requests (team, status);

CREATE UNIQUE INDEX uq_service_requests_payment_ref
    ON service_requests (payment_ref) WHERE payment_ref IS NOT NULL;

CREATE UNIQUE INDEX uq_service_requests_ticket
    ON service_requests (ticket_id) WHERE ticket_id IS NOT NULL;

-- When a request entered its current status, so the rental desk's turnaround is measured from the
-- moment the matter became its move rather than from when it was opened.
CREATE INDEX idx_service_requests_rent_agreement_sla
    ON service_requests (status, status_changed_at)
    WHERE type = 'rent-agreement';

CREATE INDEX idx_service_requests_referral_credit ON service_requests (requester_id) WHERE referral_credit;

-- The one definition of "the same flat" for the overlap check; RentAgreementOverlaps#flatKey must agree.
CREATE FUNCTION rent_agreement_flat_key(details jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE WHEN k.flat = '' OR k.society = '' OR k.pincode = '' THEN NULL
                ELSE k.flat || '|' || k.society || '|' || k.pincode END
    FROM (SELECT
        regexp_replace(regexp_replace(regexp_replace(lower(coalesce(details #>> '{_state,prop,flatNo}', '')),
            '\m(flat|no|number|unit|apt|apartment)\M', '', 'g'), '[^a-z0-9]', '', 'g'), '^0+', '') AS flat,
        regexp_replace(lower(coalesce(details #>> '{_state,prop,society}', '')), '[^a-z0-9]', '', 'g') AS society,
        regexp_replace(lower(coalesce(details #>> '{_state,prop,pincode}', '')), '[^a-z0-9]', '', 'g') AS pincode) k
$$;

CREATE INDEX idx_service_requests_rent_agreement_flat
    ON service_requests (rent_agreement_flat_key(details))
    WHERE type = 'rent-agreement';

COMMENT ON COLUMN service_requests.referral_credit IS
    'True once a referral-earned free rent agreement was spent on this request, which waives only '
    'Draazy''s own service fee. A credit is held while the request is anything but cancelled.';

-- Backstop for the racy count-then-insert in ServiceRequestService.create: one unpaid order per (requester, type).
-- Matches MAX_OPEN_UNPAID_PER_TYPE = 1; raising it means replacing this index (a unique index cannot say "at most N").
CREATE UNIQUE INDEX uq_service_requests_open_unpaid
    ON service_requests (requester_id, type)
    WHERE status = 'awaiting-payment';

COMMENT ON COLUMN service_requests.version IS
    'Optimistic-locking counter (D48). Maintained by Hibernate; raw SQL updates bypass it.';

COMMENT ON COLUMN service_requests.team IS
    'The ops desk that works this request (D44). Derived from `type` by a total map -- see the '
    'service_requests_type_team_check pair constraint and ServiceRequestTypes.teamFor. Never '
    'inferred at read time: an unmapped type must fail at INSERT, not disappear from every queue.';

COMMENT ON COLUMN service_requests.ticket_id IS
    'The ops board item this request came off, if any (D45). Nullable: a request raised straight '
    'from the customer wizard has no ticket. Unique where present -- one ticket, one request.';

-- No `attachments` column despite MessageCreate documenting it: the field is accepted and dropped, uploads use /docs.
-- Separate from the timeline: messages are written by people, timeline rows by the server as audit events.

CREATE TABLE service_request_messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  uuid NOT NULL REFERENCES service_requests(id),
    author_id   uuid REFERENCES users(id),
    author_role text CHECK (author_role IN ('buyer','owner','staff','manager','admin')),
    body        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    -- Nullable timestamp: the thread has two sides, so `read_at` means seen by the side that did not write it.
    read_at     timestamptz
);
CREATE INDEX idx_service_request_messages_request
    ON service_request_messages (request_id, created_at);

CREATE INDEX idx_service_request_messages_unread
    ON service_request_messages (request_id)
    WHERE read_at IS NULL;

CREATE TABLE service_request_timeline (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES service_requests(id),
    at         timestamptz NOT NULL DEFAULT now(),
    event      text NOT NULL,
    by         text
);
CREATE INDEX idx_service_timeline_request ON service_request_timeline (request_id, at);

-- Narrow channel for PAN/Aadhaar: not `details` (echoed on every staff read) nor the vault (signed URLs, unauditable).
-- ON DELETE CASCADE so no Aadhaar outlives its request; `purged_at` marks rows blanked on completion or cancellation.
CREATE TABLE service_request_identities (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    party_role         text NOT NULL,                     -- 'owner' | 'tenant' | 'witness'
    party_index        integer NOT NULL DEFAULT 0,        -- 0 for the owner; 0..n across tenants
    party_name         text,                              -- survives the purge; the numbers do not
    pan                text,                              -- ABCDE1234F, or NULL
    aadhaar            text,                              -- 12 digits, or NULL
    created_at         timestamptz NOT NULL DEFAULT now(),
    purged_at          timestamptz,                       -- set when the numbers were blanked
    CONSTRAINT service_request_identities_role_check
        CHECK (party_role IN ('owner', 'tenant', 'witness')),
    CONSTRAINT service_request_identities_index_check
        CHECK (party_index >= 0),
    -- The wizard resubmits the whole set, so the service replaces: one row per party, never duplicates.
    CONSTRAINT uq_service_request_identity_party
        UNIQUE (service_request_id, party_role, party_index)
);

-- Only ever read per request, in drafting order: a cross-request query would be the ops-queue identity leak.
CREATE INDEX idx_service_request_identities_request
    ON service_request_identities (service_request_id, party_role, party_index);

COMMENT ON TABLE service_request_identities IS
    'PAN/Aadhaar for the parties named in a service request (D151). Written by the requester, '
    'readable only by the staff member the request is assigned to, audited on every read, and '
    'blanked when the request reaches a terminal status. Never projected onto ServiceRequestDto '
    'and never included in any list response.';

COMMENT ON COLUMN service_request_identities.purged_at IS
    'When pan/aadhaar were blanked because the request completed or was cancelled. NULL means the '
    'numbers are still held.';

-- No bearer invite token: access needs an account; `mobile` exists only while pending (see `addressee`).
-- Pending rows are erased with the subject's old mobile and swept by CoFillInviteRetentionSweep on expiry.
CREATE TABLE service_request_parties (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  uuid NOT NULL REFERENCES service_requests(id),

    user_id     uuid REFERENCES users(id),
    mobile      text CHECK (mobile IS NULL OR mobile ~ '^[6-9][0-9]{9}$'),

    role        text NOT NULL CHECK (role IN ('owner', 'tenant')),
    -- `invited` reveals no request content: a mistyped mobile resolving to a stranger must not hand them the paperwork.
    -- Only `accepted` widens the request's read scope (see CoFillParties).
    status      text NOT NULL DEFAULT 'invited'
                CHECK (status IN ('invited', 'accepted', 'declined')),
    invited_by  uuid NOT NULL REFERENCES users(id),

    -- Only pending rows have a clock: an unclaimed number is deleted before it can be recycled to a stranger.
    invite_expires_at timestamptz,

    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    party_index integer NOT NULL DEFAULT 0,

    -- Exactly one of user_id / mobile: a claim is a move, so a claimed row never keeps the number.
    CONSTRAINT service_request_parties_addressee_check
        CHECK ((user_id IS NULL) <> (mobile IS NULL)),

    -- A pending row must carry an expiry, or the sweep (`invite_expires_at < now()`) would never see it.
    CONSTRAINT service_request_parties_pending_check
        CHECK (user_id IS NOT NULL
               OR (status = 'invited' AND invite_expires_at IS NOT NULL))
);

CREATE UNIQUE INDEX uq_service_request_parties_role_index
    ON service_request_parties (request_id, role, party_index);

-- Admits NULLs (distinct in a unique index), so pending rows are unconstrained; the claim path re-checks it explicitly
-- before filling `user_id`.
CREATE UNIQUE INDEX uq_service_request_parties_user
    ON service_request_parties (request_id, user_id);

CREATE INDEX idx_service_request_parties_user
    ON service_request_parties (user_id, status);

-- Pending rows only: the claim runs on every customer read of the list and must be cheap when nothing is pending.
CREATE INDEX idx_service_request_parties_pending
    ON service_request_parties (mobile)
    WHERE mobile IS NOT NULL;

CREATE INDEX idx_service_request_parties_expiry
    ON service_request_parties (invite_expires_at)
    WHERE invite_expires_at IS NOT NULL;

COMMENT ON COLUMN service_request_parties.mobile IS
    'PERSONAL DATA, transient. The invited counterparty''s number, held only until they register and '
    'the row is claimed, at which point user_id is filled and this is set back to NULL. Erased by '
    'ErasureService keyed on the old mobile; expired by CoFillInviteRetentionSweep after 90 days.';

COMMENT ON COLUMN service_request_parties.invite_expires_at IS
    'When an unclaimed invitation is deleted. NULL once claimed. Bounds how long a mobile belonging '
    'to a non-user is retained, and stops a recycled number being claimed by its next holder.';

COMMENT ON COLUMN service_request_parties.user_id IS
    'The party, once they hold an account. NULL while the invitation is still addressed to a mobile.';

-- Document number is unique per Sub-Registrar office and year, and a GRAS challan (GRN) pays for one document:
-- repeating either means a copy recorded twice or a challan reused.
CREATE TABLE service_request_registrations (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id uuid        NOT NULL UNIQUE REFERENCES service_requests(id),
    document_no        varchar(40) NOT NULL,
    sro                varchar(60) NOT NULL,
    registered_on      date        NOT NULL,
    grn                varchar(25) NOT NULL,
    stamp_duty         bigint      NOT NULL CHECK (stamp_duty >= 0),
    registration_fee   bigint      NOT NULL CHECK (registration_fee >= 0),
    recorded_by        uuid        REFERENCES users(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_service_request_registrations_document
    ON service_request_registrations (lower(sro), upper(document_no), (extract(year from registered_on)));

CREATE UNIQUE INDEX uq_service_request_registrations_grn
    ON service_request_registrations (upper(grn));

-- A post-payment change moves the stamp duty, so the new terms are proposed here and any higher price is paid first.
-- paid_at is set when the top-up order is confirmed, whatever became of the amendment.
CREATE TABLE service_request_amendments (
    id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id uuid         NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    terms              jsonb        NOT NULL,
    reason             varchar(300) NOT NULL,
    amount_before      bigint       NOT NULL CHECK (amount_before >= 0),
    amount_after       bigint       NOT NULL CHECK (amount_after >= 0),
    status             varchar(10)  NOT NULL CHECK (status IN ('proposed', 'applied', 'withdrawn')),
    payment_ref        text         UNIQUE,
    proposed_by        uuid         REFERENCES users(id) ON DELETE SET NULL,
    decided_by         uuid         REFERENCES users(id) ON DELETE SET NULL,
    decided_at         timestamptz,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    paid_at            timestamptz,
    CHECK ((status = 'proposed') = (decided_at IS NULL))
);

CREATE UNIQUE INDEX uq_service_request_amendments_open
    ON service_request_amendments (service_request_id) WHERE status = 'proposed';

-- Maker-checker refund; each draws on one gateway order, since a refund split across orders could half-succeed.
-- A gateway-cancelled refund keeps its gateway id; only an approved one counts against what can be refunded.
CREATE TABLE service_request_refunds (
    id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id uuid         NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    order_id           text         NOT NULL,
    amount             bigint       NOT NULL CHECK (amount > 0),
    duty_paid          boolean      NOT NULL,
    grn                varchar(25),
    reason             varchar(300) NOT NULL,
    status             varchar(10)  NOT NULL CHECK (status IN ('requested', 'approved', 'rejected', 'failed')),
    requested_by       uuid         REFERENCES users(id) ON DELETE SET NULL,
    decided_by         uuid         REFERENCES users(id) ON DELETE SET NULL,
    decided_at         timestamptz,
    decision_note      varchar(300),
    gateway_refund_id  text         UNIQUE,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    CHECK ((status = 'requested') = (decided_at IS NULL)),
    CHECK (NOT duty_paid OR grn IS NOT NULL),
    CONSTRAINT service_request_refunds_gateway_ref_check
        CHECK ((status IN ('approved', 'failed')) = (gateway_refund_id IS NOT NULL))
);

CREATE UNIQUE INDEX uq_service_request_refunds_open
    ON service_request_refunds (service_request_id) WHERE status = 'requested';

CREATE TABLE service_request_police_intimations (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id uuid        NOT NULL UNIQUE REFERENCES service_requests(id) ON DELETE CASCADE,
    confirmed_by       uuid        REFERENCES users(id) ON DELETE SET NULL,
    confirmed_at       timestamptz NOT NULL DEFAULT now(),
    reference          varchar(80),
    submitted_on       date,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_request_police_intimations_request
    ON service_request_police_intimations (service_request_id);

CREATE TABLE service_request_draft_approvals (
    id uuid primary key default gen_random_uuid(),
    request_id uuid not null references service_requests(id),
    draft_version integer not null check (draft_version > 0),
    party_key text not null,
    party_label text not null,
    user_id uuid references users(id),
    mobile_hash text,
    mobile_masked text,
    method text not null check (method in ('in_app', 'otp')),
    opened_at timestamptz,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint service_request_draft_approvals_target_check
        check ((method = 'in_app' and user_id is not null) or (method = 'otp' and mobile_hash is not null)),
    constraint uq_service_request_draft_approvals_party unique (request_id, draft_version, party_key)
);

create index idx_service_request_draft_approvals_request
    on service_request_draft_approvals(request_id, draft_version);

create table service_request_draft_checks (
    id uuid primary key default gen_random_uuid(),
    request_id uuid not null references service_requests(id),
    draft_version integer not null check (draft_version > 0),
    status text not null check (status in ('pending', 'released', 'sent-back')),
    reasons text not null,
    note text,
    shared_by uuid not null references users(id),
    checked_by uuid references users(id),
    checked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_service_request_draft_checks_version unique (request_id, draft_version)
);

create index idx_service_request_draft_checks_request
    on service_request_draft_checks(request_id, draft_version desc);


CREATE TABLE reports (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type text NOT NULL
                  CONSTRAINT reports_target_type_check
                  CHECK (target_type IN ('property', 'user', 'review', 'post')),
    target_id   text NOT NULL,
    reporter_id uuid REFERENCES users(id),
    reason      text NOT NULL,
    details     text,
    status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','actioned','dismissed')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_target ON reports (target_type, target_id);

-- Composite (status, created_at DESC) serves `GET /reports` (open, newest first); bare (status) is redundant.
CREATE INDEX idx_reports_status_created ON reports (status, created_at DESC);

CREATE INDEX idx_reports_created ON reports (created_at DESC);

-- One open report per reporter per target: a double-fired tap would otherwise file it N times. Partial on status so a
-- target can be re-reported after action; reporter_id is nullable, so anonymous reports do not collide.
CREATE UNIQUE INDEX idx_reports_one_open_per_reporter
    ON reports (reporter_id, target_type, target_id)
    WHERE reporter_id IS NOT NULL AND status IN ('open', 'reviewing');

-- No CHECK on reason: validity depends on the target type (per-type sets that partly overlap), so the service validates
-- it against ReportReasons; a vocabulary check has no race for the database to arbitrate.
COMMENT ON COLUMN reports.reason IS
    'Per-target-type vocabulary, validated in ReportService against ReportReasons (V18). '
    'Deliberately no CHECK: the legal set depends on target_type, which one flat constraint cannot express.';

-- entity_id is text and NOT a foreign key: a note on a listing archived an hour later is the one worth keeping.
-- NoteEntityKey resolves a slug to its uuid before any read or write, so one listing cannot have two note histories.
CREATE TABLE internal_notes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text        NOT NULL CHECK (entity_type IN ('property', 'user', 'review', 'report', 'service_request')),
    entity_id   text        NOT NULL,
    author_id   uuid        NOT NULL,
    action      text,
    text        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_notes_entity
    ON internal_notes (entity_type, entity_id, created_at DESC);

COMMENT ON COLUMN internal_notes.entity_type IS
    'What the note is about, mirrored in NoteEntityTypes. Widened by V38 to admit service_request. '
    'The list is written twice on purpose: this CHECK refuses a bad row even if a future caller '
    'reaches the table another way, and the API refuses it with a 422 rather than a constraint '
    'violation.';

-- `lead_key` is opaque TEXT, not an FK: it unions four unrelated tables and a grouping key with no row at all.
-- Nothing cascades, so notes on hard-deleted leads are orphaned but invisible to the inbox.
CREATE TABLE lead_notes (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Taken from the JWT, never a body; with the unique index it makes notes reachable only by their owner.
    owner_id     uuid NOT NULL REFERENCES users(id),

    lead_key     text NOT NULL,

    -- Bounded: a btree entry over 2704 bytes fails at INSERT as a 500; the controller has the same bound.
    -- The document key embeds the buyer's unmasked mobile, so this is personal data: do not log it.
    CONSTRAINT lead_notes_key_length CHECK (length(lead_key) <= 200),

    -- A row with both note and follow-up null is meaningless: the CHECK forbids it and the service deletes instead.
    note         text,
    follow_up_at timestamptz,

    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT lead_notes_not_empty
        CHECK (note IS NOT NULL OR follow_up_at IS NOT NULL),

    -- Same bound as the controller (2000): a DTO-only limit misses imports and UPDATEs; notes are read unpaged.
    CONSTRAINT lead_notes_note_length CHECK (note IS NULL OR length(note) <= 2000)
);

-- One annotation per lead per owner makes the write an upsert; `owner_id` leads because the inbox fetches all of them.
CREATE UNIQUE INDEX uq_lead_notes_owner_lead ON lead_notes (owner_id, lead_key);

-- Convention: every migration ends by wiring trg_set_updated_at onto every table with updated_at; idempotent.
SELECT install_updated_at_triggers();
