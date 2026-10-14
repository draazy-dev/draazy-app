-- Flat-sharing market: seeker posts, rooms, groups, host inbox, Ops agreement review, owner consent, shortlist.
-- flatmate_groups and flatmate_rooms must precede the tables that carry foreign keys to them.

-- A person, not a listing: no address to moderate, no owner to verify, which is why verified_contact_only exists.
CREATE TABLE flatmate_seeker_posts (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               uuid        NOT NULL REFERENCES users (id),
    name                  text        NOT NULL,
    gender                text        NOT NULL DEFAULT 'any' CHECK (gender IN ('any','male','female')),
    age                   integer     CHECK (age IS NULL OR age >= 18),
    occupation            text,
    budget                bigint      NOT NULL CHECK (budget > 0),
-- Free text on purpose ('now', a legacy day bucket or an ISO date); the service parses it into move_in_at.
    localities            jsonb       NOT NULL DEFAULT '[]'::jsonb,
    move_in               text,
-- Snapshotted at post time, not joined live: recomputing would rewrite the badge's history on every read.
    move_in_at            date,
    flat_pref             text        NOT NULL DEFAULT 'any' CHECK (flat_pref IN ('any','women','men')),
    room_pref             text        NOT NULL DEFAULT 'any' CHECK (room_pref IN ('any','private','shared')),
    tags                  jsonb       NOT NULL DEFAULT '[]'::jsonb,
    note                  text        CHECK (note IS NULL OR length(note) <= 600),
    verified_contact_only boolean     NOT NULL DEFAULT false,
    verified              boolean     NOT NULL DEFAULT false,
-- Moderated before public: `pending` is the default so every insert path starts unvetted.
    mod_status            text        NOT NULL DEFAULT 'pending'
                              CHECK (mod_status IN ('pending','live','approved','flagged','removed','rejected','expired')),
    lat                   double precision,
    lng                   double precision,
    archived              boolean     NOT NULL DEFAULT false,
    archived_at           timestamptz,
    archive_reason        text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    recheck_requested_at  timestamptz,
    recheck_reason        text,
    budget_max            bigint      CHECK (budget_max IS NULL OR budget_max > 0),
    title                 text        CHECK (title IS NULL OR char_length(title) <= 120),
-- Own column since updated_at moves on every write; expired_from keeps live vs approved across a renewal.
    active_until          timestamptz NOT NULL DEFAULT now() + interval '30 days',
    expiry_reminded       boolean     NOT NULL DEFAULT false,
    expired_from          text        CHECK (expired_from IN ('live', 'approved')),
    CONSTRAINT ck_flatmate_seeker_posts_budget_range
        CHECK (budget_max IS NULL OR budget_max >= budget)
);

-- One live post per identity, enforced here so concurrent creates cannot both pass a count check.
-- Partial, so archiving frees the slot.
CREATE UNIQUE INDEX uq_flatmate_seeker_posts_live_user
    ON flatmate_seeker_posts (user_id) WHERE archived = false;

-- A partial index must be at least as permissive as the query predicate to be used, hence the live/approved whitelist.
CREATE INDEX idx_flatmate_seeker_posts_feed
    ON flatmate_seeker_posts (created_at DESC)
    WHERE archived = false AND mod_status IN ('live','approved');

-- Moderation queue read, oldest first; partial because the table is dominated by already-decided rows.
CREATE INDEX idx_flatmate_seeker_posts_pending
    ON flatmate_seeker_posts (created_at)
    WHERE mod_status = 'pending' AND archived = false;

-- Locality filtering is a jsonb @> containment test, which the default GIN operator class answers.
CREATE INDEX idx_flatmate_seeker_posts_localities
    ON flatmate_seeker_posts USING gin (localities);

CREATE INDEX idx_flatmate_seeker_posts_budget ON flatmate_seeker_posts (budget)
    WHERE archived = false;

CREATE INDEX idx_flatmate_seeker_posts_recheck_pending
    ON flatmate_seeker_posts (recheck_requested_at)
 WHERE recheck_requested_at IS NOT NULL;

CREATE INDEX idx_flatmate_seeker_posts_active_until ON flatmate_seeker_posts (active_until)
    WHERE archived = false AND mod_status IN ('live','approved');

COMMENT ON COLUMN flatmate_seeker_posts.recheck_requested_at IS
    'As flatmate_rooms.recheck_requested_at, for a seeker post: raised by an edit to the name, the '
    'note or the budget. A post has no address and no host tier, so the free text is the whole of '
    'what a moderator re-reads -- and before this column a new note went straight through.';

COMMENT ON COLUMN flatmate_seeker_posts.recheck_reason IS
    'As flatmate_rooms.recheck_reason.';

COMMENT ON COLUMN flatmate_seeker_posts.budget_max IS
    'The top of what this seeker will pay, or null when they quoted a single number. `budget` is the '
    'floor in both cases, so a null here means the range is a point rather than that it is open.';

COMMENT ON TABLE flatmate_seeker_posts IS
    'A person looking for flatmates with no address yet (the team-up tab). One live row per user; '
    'archiving frees the slot. Carries no contact -- the requester volunteers their own.';

-- Two creation paths share this table: spare room (seat model: seats_total/seats_open) and rent-listing split
-- (occupancy model: occupants/max_occupants). The service refuses to mix them; a split is a row with a property_id.
CREATE TABLE flatmate_rooms (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id            uuid        NOT NULL REFERENCES users (id),
-- Parent rent listing for split rooms; ties siblings into one occupancy ledger. Null for standalone spare rooms.
    property_id        uuid        REFERENCES properties (id),
    room_kind          text        CHECK (room_kind IS NULL OR room_kind IN ('master','bedroom','living')),
    room_type          text        NOT NULL CHECK (room_type IN ('Private room','Shared room')),
    attached_bath      text        NOT NULL DEFAULT 'shared' CHECK (attached_bath IN ('attached','shared')),
-- person = what one person pays, room = whole room cost; explicit so a shared bed never looks pricier.
    price_basis        text        NOT NULL DEFAULT 'person' CHECK (price_basis IN ('room','person')),
    budget             bigint      NOT NULL CHECK (budget > 0),
    deposit            bigint      CHECK (deposit IS NULL OR deposit >= 0),
    occupants          integer     NOT NULL DEFAULT 0 CHECK (occupants BETWEEN 0 AND 3),
    max_occupants      integer     NOT NULL DEFAULT 3 CHECK (max_occupants >= 1),
    seats_total        integer     CHECK (seats_total IS NULL OR seats_total >= 1),
    seats_open         integer     CHECK (seats_open IS NULL OR seats_open >= 0),
    host_role          text        NOT NULL DEFAULT 'tenant' CHECK (host_role IN ('owner','tenant')),
-- Derived server-side, never client-supplied: a host naming its own tier could award itself the trust badge.
    verification_tier  text        NOT NULL DEFAULT 'identity'
                           CHECK (verification_tier IN ('identity','tenant','owner')),
    agreement_declared boolean     NOT NULL DEFAULT false,
-- Stable key for one physical flat; indexed but not unique (see idx_flatmate_rooms_fingerprint).
    address_fingerprint text,
    flag_for_review    boolean     NOT NULL DEFAULT false,
    mod_status         text        NOT NULL DEFAULT 'pending'
                           CHECK (mod_status IN ('pending','live','approved','flagged','removed','rejected','expired')),
    society_id         uuid        REFERENCES societies (id),
    society            text,
    flat_number        text,
    locality           text        NOT NULL,
    localities         jsonb       NOT NULL DEFAULT '[]'::jsonb,
    lat                double precision,
    lng                double precision,
    bhk                text        CHECK (bhk IS NULL OR bhk IN ('1','2','3','4')),
    flat_type          text,
    home_type_label    text,
    gated_community    boolean     NOT NULL DEFAULT false,
    furnishing         text        CHECK (furnishing IS NULL OR furnishing IN ('unfurnished','semi','furnished')),
    move_in            text,
    available_from     date,
    gender             text        NOT NULL DEFAULT 'any' CHECK (gender IN ('any','male','female')),
    food               text        NOT NULL DEFAULT 'any' CHECK (food IN ('any','veg','nonveg')),
    tags               jsonb       NOT NULL DEFAULT '[]'::jsonb,
    note               text        CHECK (note IS NULL OR length(note) <= 600),
    photos             jsonb       NOT NULL DEFAULT '[]'::jsonb,
    status             text        NOT NULL DEFAULT 'active',
    archived           boolean     NOT NULL DEFAULT false,
    archived_at        timestamptz,
    archive_reason     text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    facing             text,
    overlooking        text,
    recheck_requested_at timestamptz,
    recheck_reason     text,
    owner_consent      boolean     NOT NULL DEFAULT false,
    owner_consent_mobile text,
    notice_period_days integer     CHECK (notice_period_days IS NULL OR notice_period_days BETWEEN 0 AND 180),
    lock_in_months     integer     CHECK (lock_in_months IS NULL OR lock_in_months BETWEEN 0 AND 24),
    maintenance_billing text       CHECK (maintenance_billing IS NULL OR maintenance_billing IN ('included','shared','separate')),
    electricity_billing text       CHECK (electricity_billing IS NULL OR electricity_billing IN ('included','shared','separate')),
    details            jsonb       CHECK (details IS NULL OR jsonb_typeof(details) = 'object'),
    title              text        CHECK (title IS NULL OR char_length(title) <= 120),
    active_until       timestamptz NOT NULL DEFAULT now() + interval '30 days',
    expiry_reminded    boolean     NOT NULL DEFAULT false,
    expired_from       text        CHECK (expired_from IN ('live', 'approved', 'pending')),

    CONSTRAINT ck_flatmate_rooms_home_type_label
        CHECK (home_type_label IS NULL
               OR home_type_label IN ('Flat', 'Independent House', 'Villa', 'Row House')),
    CONSTRAINT ck_flatmate_rooms_owner_consent_mobile
        CHECK (owner_consent_mobile IS NULL OR owner_consent_mobile ~ '^[6-9][0-9]{9}$'),

-- A room is one model or the other, never both; every read must know which ledger to trust.
    CONSTRAINT ck_flatmate_rooms_seat_model
        CHECK ((seats_total IS NULL AND seats_open IS NULL)
            OR (seats_total IS NOT NULL AND seats_open IS NOT NULL AND seats_open <= seats_total)),
-- Split rooms are occupancy-model; a seat count would be a second, disagreeing answer to 'how many can move in'.
    CONSTRAINT ck_flatmate_rooms_split_has_no_seats
        CHECK (property_id IS NULL OR seats_total IS NULL)
);

CREATE INDEX idx_flatmate_rooms_feed
    ON flatmate_rooms (created_at DESC)
    WHERE archived = false AND mod_status IN ('live','approved');

CREATE INDEX idx_flatmate_rooms_pending
    ON flatmate_rooms (created_at)
    WHERE mod_status = 'pending' AND archived = false;

CREATE INDEX idx_flatmate_rooms_locality ON flatmate_rooms (lower(locality))
    WHERE archived = false;

CREATE INDEX idx_flatmate_rooms_budget ON flatmate_rooms (budget) WHERE archived = false;

CREATE INDEX idx_flatmate_rooms_property ON flatmate_rooms (property_id)
    WHERE property_id IS NOT NULL AND archived = false;

-- Deliberately not unique: the fingerprint is fuzzy, so two different flats can collide; contested addresses are
-- flagged for Ops, and only the same-host case is blocked by the service.
CREATE INDEX idx_flatmate_rooms_fingerprint ON flatmate_rooms (address_fingerprint)
    WHERE address_fingerprint IS NOT NULL AND archived = false;

CREATE INDEX idx_flatmate_rooms_host ON flatmate_rooms (host_id) WHERE archived = false;

CREATE INDEX idx_flatmate_rooms_recheck_pending
    ON flatmate_rooms (recheck_requested_at)
 WHERE recheck_requested_at IS NOT NULL;

CREATE INDEX idx_flatmate_rooms_active_until ON flatmate_rooms (active_until)
    WHERE archived = false AND mod_status IN ('live','approved');

COMMENT ON COLUMN flatmate_rooms.verification_tier IS
    'How far the host''s claim on this flat has been checked: identity < tenant < owner. Derived server-side and never accepted from a client. The Verified badge is read from this plus the flatmate_reviews verdict, never stored -- a stored badge outlives the verdict that earned it.';

COMMENT ON COLUMN flatmate_rooms.recheck_requested_at IS
    'Set when a host edits a stays-live field -- photos, note, rent, address, furnishing, '
    'availability -- on a room a stranger can already see. The room stays visible; this is the '
    'moderation work item, and its age is the SLA. Cleared when a moderator sets a mod_status, and '
    'whenever an edit sends the room back to pending: a full re-moderation supersedes a re-check.';

COMMENT ON COLUMN flatmate_rooms.recheck_reason IS
    'Human-readable list of the fields that raised the pending re-check, e.g. "photos, note". '
    'Accumulates across edits until a moderator clears it, so a moderator arriving after three '
    'edits sees all three rather than only the last.';

COMMENT ON COLUMN flatmate_rooms.owner_consent IS
    'Whether the flat''s owner confirmed, by OTP, that this tenant may offer a room in it. Derived '
    'server-side from flatmate_owner_consents and never accepted from a client -- the API takes a '
    'mobile number to look the consent up by, never the boolean itself. Required for the '
    'tenant-tier badge but not for posting: parting with possession without the owner''s consent is '
    'an eviction ground under the Maharashtra Rent Control Act, so the platform declines to vouch '
    'for such a listing while still letting the host advertise at their own risk.';

COMMENT ON COLUMN flatmate_rooms.owner_consent_mobile IS
    'The number the consent above was looked up by, normalised to ten digits. Stored so an edit can '
    're-derive the flag against the same owner rather than trusting the standing boolean -- without '
    'it, pointing the field at a different number would silently keep a consent granted for someone '
    'else''s flat. V31 gave it the format CHECK flatmate_groups has carried since V13: a number that '
    'cannot key flatmate_owner_consents misses the lookup and reads as a withheld consent.';

COMMENT ON COLUMN flatmate_rooms.home_type_label IS
    'What the building is, as the card spells it. Closed vocabulary: FlatmateVocabulary.HOME_TYPE. '
    'NULL is "the host did not say", which is a different answer from any of the four.';

COMMENT ON COLUMN flatmate_rooms.details IS
    'Host-only wizard answers (floor, totalFloors, floorsInHouse, bathrooms, balconies, furniture, '
    'tower, street, landmark, pincode). Returned only on the host''s own read of the room.';

COMMENT ON TABLE flatmate_rooms IS
    'A room inside a real flat (the move-in tab). Seat model for standalone spare rooms, occupancy '
    'model for rooms created by splitting a parent rent listing. verification_tier is derived '
    'server-side and never accepted from the client.';

-- address is nullable because a group moves between the move-in and team-up tabs as it finds a flat.
CREATE TABLE flatmate_groups (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id             uuid        NOT NULL REFERENCES users (id),
    title               text        NOT NULL,
    locality            text        NOT NULL,
-- `any` is open-join: a request is auto-accepted instead of queued; other values are applied by hand.
    policy              text        NOT NULL DEFAULT 'any' CHECK (policy IN ('any','women','men')),
    rent                bigint      NOT NULL CHECK (rent > 0),
    seats_total         integer     NOT NULL DEFAULT 2 CHECK (seats_total >= 1),
-- Open right now, not seats_total minus members: a backfilled seat in a full flat has one open and four members.
    seats_open          integer     CHECK (seats_open IS NULL OR seats_open >= 0),
    property_id         uuid        REFERENCES properties (id),
    host_role           text        NOT NULL DEFAULT 'tenant' CHECK (host_role IN ('owner','tenant')),
    verification_tier   text        NOT NULL DEFAULT 'identity'
                            CHECK (verification_tier IN ('identity','tenant','owner')),
    agreement_declared  boolean     NOT NULL DEFAULT false,
-- True only once the flat's owner confirmed by OTP; never client-asserted.
    owner_consent       boolean     NOT NULL DEFAULT false,
    owner_consent_mobile text       CHECK (owner_consent_mobile IS NULL OR owner_consent_mobile ~ '^[6-9][0-9]{9}$'),
    address_fingerprint text,
    flag_for_review     boolean     NOT NULL DEFAULT false,
    mod_status          text        NOT NULL DEFAULT 'pending'
                            CHECK (mod_status IN ('pending','live','approved','flagged','removed','rejected','expired')),
    tags                jsonb       NOT NULL DEFAULT '[]'::jsonb,
    note                text        CHECK (note IS NULL OR length(note) <= 600),
    archived            boolean     NOT NULL DEFAULT false,
    archived_at         timestamptz,
    archive_reason      text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    lat                 double precision,
    lng                 double precision,
    per_head            bigint
        GENERATED ALWAYS AS (round(rent::numeric / seats_total)::bigint) STORED,
    recheck_requested_at timestamptz,
    recheck_reason      text,
    deposit             bigint      CHECK (deposit IS NULL OR deposit >= 0),
    notice_period_days  integer     CHECK (notice_period_days IS NULL OR notice_period_days BETWEEN 0 AND 180),
    lock_in_months      integer     CHECK (lock_in_months IS NULL OR lock_in_months BETWEEN 0 AND 24),
    maintenance_billing text        CHECK (maintenance_billing IS NULL OR maintenance_billing IN ('included','shared','separate')),
    electricity_billing text        CHECK (electricity_billing IS NULL OR electricity_billing IN ('included','shared','separate')),
-- A hunting group states a budget ceiling in rent; preference columns apply only when hunting is true.
    hunting             boolean     NOT NULL DEFAULT false,
    localities          jsonb       NOT NULL DEFAULT '[]'::jsonb,
    pref_bhk            jsonb       NOT NULL DEFAULT '[]'::jsonb,
    rent_min            bigint      CHECK (rent_min IS NULL OR rent_min >= 0),
    deposit_min         bigint      CHECK (deposit_min IS NULL OR deposit_min >= 0),
    deposit_max         bigint      CHECK (deposit_max IS NULL OR deposit_max >= 0),
    gated_only          boolean     NOT NULL DEFAULT false,
    bachelors           boolean     NOT NULL DEFAULT false,
    furnishing          text        CHECK (furnishing IS NULL OR furnishing IN ('unfurnished','semi','furnished')),
    move_in_by          date,
    active_until        timestamptz NOT NULL DEFAULT now() + interval '30 days',
    expiry_reminded     boolean     NOT NULL DEFAULT false,
    expired_from        text        CHECK (expired_from IN ('live', 'approved', 'pending')),

    CONSTRAINT ck_flatmate_groups_seats_open
        CHECK (seats_open IS NULL OR seats_open <= seats_total),
    CONSTRAINT ck_flatmate_groups_pref_bhk
        CHECK (jsonb_typeof(pref_bhk) = 'array' AND pref_bhk <@ '["1","2","3","4"]'::jsonb),
    CONSTRAINT ck_flatmate_groups_rent_range
        CHECK (rent_min IS NULL OR rent_min <= rent),
    CONSTRAINT ck_flatmate_groups_deposit_range
        CHECK (deposit_min IS NULL OR deposit_max IS NULL OR deposit_min <= deposit_max),
    CONSTRAINT ck_flatmate_groups_hunting_unhoused
        CHECK (NOT hunting OR property_id IS NULL)
);

ALTER TABLE conversations
    ADD CONSTRAINT conversations_flatmate_group_id_fkey
        FOREIGN KEY (flatmate_group_id) REFERENCES flatmate_groups (id);

CREATE INDEX idx_flatmate_groups_feed
    ON flatmate_groups (created_at DESC)
    WHERE archived = false AND mod_status IN ('live','approved');

CREATE INDEX idx_flatmate_groups_pending
    ON flatmate_groups (created_at)
    WHERE mod_status = 'pending' AND archived = false;

CREATE INDEX idx_flatmate_groups_locality ON flatmate_groups (lower(locality))
    WHERE archived = false;

CREATE INDEX idx_flatmate_groups_fingerprint ON flatmate_groups (address_fingerprint)
    WHERE address_fingerprint IS NOT NULL AND archived = false;

CREATE INDEX idx_flatmate_groups_host ON flatmate_groups (host_id) WHERE archived = false;

CREATE INDEX idx_flatmate_groups_recheck_pending
    ON flatmate_groups (recheck_requested_at)
 WHERE recheck_requested_at IS NOT NULL;

CREATE INDEX idx_flatmate_groups_localities ON flatmate_groups USING gin (localities jsonb_path_ops);

CREATE INDEX idx_flatmate_groups_active_until ON flatmate_groups (active_until)
    WHERE archived = false AND mod_status IN ('live','approved');

COMMENT ON COLUMN flatmate_groups.recheck_requested_at IS
    'As flatmate_rooms.recheck_requested_at, for a group: raised by an edit to the title, the note, '
    'the rent or the lifestyle tags on a group that is already on the board.';

COMMENT ON COLUMN flatmate_groups.recheck_reason IS
    'As flatmate_rooms.recheck_reason.';

COMMENT ON COLUMN flatmate_groups.hunting IS
    'True for a group still looking for a flat: it states preferences (ranges, a shortlist) instead '
    'of the terms of a flat it holds. Never true alongside a property_id.';

COMMENT ON COLUMN flatmate_groups.localities IS
    'Where the group would live. A hunting group names up to three; any other group holds its one '
    'locality here. `locality` is the first entry, kept for the single-locality readers.';

COMMENT ON COLUMN flatmate_groups.pref_bhk IS
    'Flat sizes a hunting group would take, as FlatmateVocabulary.BHK tokens (4 means 4+).';

COMMENT ON COLUMN flatmate_groups.rent_min IS
    'Floor of a hunting group''s whole-flat rent budget. The ceiling is `rent`.';

COMMENT ON TABLE flatmate_groups IS
    'People teaming up. With an address it sorts into move-in, without into team-up -- the same row '
    'moves between tabs as the group finds a flat.';

-- Row per member (not jsonb) so a member can later be a user; user_id is null for named-but-unregistered flatmates.
-- name is nullable: OTP accounts have none, and NULL is honest where an invented 'Member' would be stored as fact.
CREATE TABLE flatmate_group_members (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   uuid        NOT NULL REFERENCES flatmate_groups (id) ON DELETE CASCADE,
    user_id    uuid        REFERENCES users (id),
    name       text,
-- Stored, not derived: a person may prefer initials that are not the first letters of their account name.
    initials   text        CHECK (initials IS NULL OR length(initials) <= 2),
    verified   boolean     NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_flatmate_group_members_group ON flatmate_group_members (group_id);

-- Partial so unregistered members (all null user_id) do not collide with each other.
CREATE UNIQUE INDEX uq_flatmate_group_members_user
    ON flatmate_group_members (group_id, user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN flatmate_group_members.name IS
    'Display name, or NULL when the person has not given one -- an OTP account has no name until '
    'its profile is filled in (D118). NULL is not a missing value to be defaulted: the fallback is '
    'rendered at display time so nothing invented is ever stored.';

-- Group applying to an owner's whole-flat listing. status is the owner's decision and mod_status the admin's;
-- the axes are independent: removing spam must not decline an application on the owner's behalf.
CREATE TABLE flatmate_group_applications (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id   uuid        NOT NULL REFERENCES properties (id),
    group_id     uuid        NOT NULL REFERENCES flatmate_groups (id) ON DELETE CASCADE,
    applicant_id uuid        NOT NULL REFERENCES users (id),
    status       text        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'declined')),
-- Defaults to live, not pending: an application is a private message to one host, and pending would hide it from them.
    mod_status   text        NOT NULL DEFAULT 'live'
                     CHECK (mod_status IN ('live', 'approved', 'flagged', 'removed', 'rejected')),
-- Internal moderation note; the contract has no field for it.
    note         text,
    decided_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_flatmate_group_applications_decided
        CHECK ((status = 'pending' AND decided_at IS NULL)
            OR (status <> 'pending' AND decided_at IS NOT NULL))
);

CREATE UNIQUE INDEX uq_flatmate_group_applications
    ON flatmate_group_applications (listing_id, group_id);

CREATE INDEX idx_flatmate_group_applications_listing
    ON flatmate_group_applications (listing_id, created_at DESC);

CREATE INDEX idx_flatmate_group_applications_mod
    ON flatmate_group_applications (mod_status, created_at DESC);

-- The paged admin board reads unfiltered ordered by created_at alone, which the two indexes above cannot serve.
CREATE INDEX idx_flatmate_group_applications_created
    ON flatmate_group_applications (created_at DESC);

COMMENT ON TABLE flatmate_group_applications IS
    'A flatmate group applying to an owner''s listing. `status` is the owner''s decision and '
    '`mod_status` the admin''s -- two independent axes that must never be written by each other.';

COMMENT ON COLUMN flatmate_group_applications.mod_status IS
    'Admin spam axis on a private application. Defaults to live, unlike the public flatmate '
    'surfaces (V41/D72), because an application is addressed to one host rather than published.';

-- Polymorphic on (kind, target_id), not three nullable FKs, so the inbox reads as one list. No FK: orphans are
-- avoided because every target is soft-deleted.
CREATE TABLE flatmate_requests (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind             text        NOT NULL CHECK (kind IN ('flatmate','room','group')),
    target_id        uuid        NOT NULL,
-- Denormalised to avoid a three-way union to find the owner on every inbox read.
    host_id          uuid        NOT NULL REFERENCES users (id),
    requester_id     uuid        NOT NULL REFERENCES users (id),
-- `request` needs host approval; `join` records someone already in an open-policy group.
    action           text        NOT NULL DEFAULT 'request' CHECK (action IN ('request','join')),
    share            text        NOT NULL DEFAULT 'solo' CHECK (share IN ('solo','bring','match')),
    message          text,
    status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
    requested_at     timestamptz NOT NULL DEFAULT now(),
    decided_at       timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_flatmate_requests_decided
        CHECK ((status = 'pending' AND decided_at IS NULL)
            OR (status <> 'pending' AND decided_at IS NOT NULL))
);

-- One request per person per target. A second ask is refused with 409 (not idempotent): the service checks under an
-- advisory lock; this index is the backstop above READ COMMITTED, and the save catch maps it to the same 409.
CREATE UNIQUE INDEX uq_flatmate_requests_target_requester
    ON flatmate_requests (kind, target_id, requester_id);

comment on index uq_flatmate_requests_target_requester is
    'One request per (kind, target, requester). CORRECTION TO V27''s COMMENT (D176): V27 calls this '
    'the reason the service does not check-then-insert, and calls the interest endpoints '
    'idempotent. Both are false. Both write paths -- FlatmateSeekerService.express and '
    'FlatmateSupplyService.record -- do check-then-insert, and a second ask is refused with 409, '
    'not answered idempotently. Since D175 the check runs behind an advisory lock on the requester, '
    'which closes the race under READ COMMITTED; this index is the backstop for a higher isolation '
    'level, and the DataIntegrityViolationException catch beside each save turns it into the same '
    '409 rather than a 500.';

CREATE INDEX idx_flatmate_requests_host ON flatmate_requests (host_id, requested_at DESC);

-- Backs the per-sender rate limit (requester + time window).
CREATE INDEX idx_flatmate_requests_requester ON flatmate_requests (requester_id, created_at DESC);

-- Serves the status-filtered host inbox, which idx_flatmate_requests_host cannot when few rows match.
-- Not partial: every status is read.
CREATE INDEX idx_flatmate_requests_host_status_requested
    ON flatmate_requests (host_id, status, requested_at DESC);

COMMENT ON TABLE flatmate_requests IS
    'The host-facing inbox: one row per (kind, target, requester). Resending edits the message '
    'rather than notifying twice -- a button that alerts on every press is a harassment tool.';

-- Tenant-tier posts get the badge only after Ops has read the document; owner-tier posts are vetted through
-- their parent listing and never appear here.
CREATE TABLE flatmate_reviews (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            text        NOT NULL CHECK (kind IN ('room','group')),
    room_id         uuid        REFERENCES flatmate_rooms (id) ON DELETE CASCADE,
    group_id        uuid        REFERENCES flatmate_groups (id) ON DELETE CASCADE,
    host_id         uuid        NOT NULL REFERENCES users (id),
    address         text,
    tier            text        NOT NULL CHECK (tier IN ('identity','tenant','owner')),
    flag_for_review boolean     NOT NULL DEFAULT false,
    owner_consent   boolean     NOT NULL DEFAULT false,
-- Metadata plus URL; files over 3 MB are recorded as present-but-not-stored (tooLarge) so Ops can ask the host.
    agreement_doc   jsonb,
    status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    reason          text,
    decided_by      uuid        REFERENCES users (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    agreement_valid_till date,
    tenancy_property_id uuid,

-- Exactly one target matching kind; two nullable FKs because the queue joins both tables to render an address.
    CONSTRAINT ck_flatmate_reviews_target
        CHECK ((kind = 'room'  AND room_id IS NOT NULL AND group_id IS NULL)
            OR (kind = 'group' AND group_id IS NOT NULL AND room_id IS NULL)),
    CONSTRAINT ck_flatmate_reviews_reason
        CHECK (status <> 'rejected' OR (reason IS NOT NULL AND length(trim(reason)) > 0))
);

CREATE UNIQUE INDEX uq_flatmate_reviews_room ON flatmate_reviews (room_id) WHERE room_id IS NOT NULL;
CREATE UNIQUE INDEX uq_flatmate_reviews_group ON flatmate_reviews (group_id) WHERE group_id IS NOT NULL;

CREATE INDEX idx_flatmate_reviews_status ON flatmate_reviews (status, created_at);

CREATE INDEX idx_flatmate_reviews_agreement_expiry
    ON flatmate_reviews (agreement_valid_till)
 WHERE agreement_valid_till IS NOT NULL;

COMMENT ON COLUMN flatmate_reviews.agreement_valid_till IS
    'The date the licence period ends -- typically eleven months after registration, the term '
    'Maharashtra Leave & License agreements are written for. Queried, not just displayed: the '
    'expiry sweep demotes a tenant-tier badge once this date has passed, because a badge that '
    'outlives the agreement behind it is exactly the claim the review queue exists to prevent.';

COMMENT ON COLUMN flatmate_reviews.tenancy_property_id IS
    'The property the tenant claims to occupy, retained on the review rather than the room/group. '
    'Used only to match a consented tenant claim to a Draazy-registered tenancy; it cannot grant '
    'owner tier and the sweep also requires the agreement tenant mobile to match the review host.';

COMMENT ON TABLE flatmate_reviews IS
    'Ops queue for tenant-tier posts and contested addresses. Owner-tier posts never enter it -- '
    'they are vetted through the parent listing.';

-- Keyed on the owner's mobile, not a user id: landlords usually have no account, and requiring one would mean
-- consent never gets recorded. The OTP purpose 'owner-consent' lives in the identity file.
CREATE TABLE flatmate_owner_consents (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_mobile  text        NOT NULL CHECK (owner_mobile ~ '^[6-9][0-9]{9}$'),
    granted_by    uuid        NOT NULL REFERENCES users (id),
    group_id      uuid        REFERENCES flatmate_groups (id) ON DELETE CASCADE,
    granted_at    timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    address_fingerprint text
);

-- coalesce instead of NULLS NOT DISTINCT (PostgreSQL 15+): NULLs are distinct, so legacy rows with no fingerprint
-- would be duplicable, and this schema must still run on 13.
CREATE UNIQUE INDEX uq_flatmate_owner_consents
    ON flatmate_owner_consents (owner_mobile, granted_by, coalesce(address_fingerprint, ''));

COMMENT ON COLUMN flatmate_owner_consents.address_fingerprint IS
    'The flat the consent is about, in FlatmateGuardrails fingerprint form. Null only on legacy '
    'rows taken before V30, which vouch for nothing.';

COMMENT ON TABLE flatmate_owner_consents IS
    'OTP-confirmed acknowledgement by a flat owner that a sitting tenant is seeking a replacement. '
    'Keyed on mobile because the owner usually has no account.';

-- No FK on post_id: Postgres has no polymorphic reference. Existence is checked in the service and dangling rows
-- are dropped from the projection. Separate from saved_properties, which cannot carry three target tables.
CREATE TABLE flatmate_saves (
    user_id    uuid NOT NULL REFERENCES users(id),
    kind       text NOT NULL,
    post_id    uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (user_id, kind, post_id),
    CONSTRAINT flatmate_saves_kind_chk CHECK (kind IN ('room', 'group', 'post'))
);

-- clock_timestamp(), not now(): now() is constant within a transaction, so saves made together would tie
-- and the newest-first order would be arbitrary.
CREATE INDEX ix_flatmate_saves_user_created ON flatmate_saves (user_id, created_at DESC);

COMMENT ON TABLE flatmate_saves IS
    'A user''s flatmate shortlist. `kind` names which table `post_id` points at: flatmate_rooms, '
    'flatmate_groups or flatmate_seeker_posts. Hard-deleted like saved_properties (D8.9) — a '
    'shortlist toggle is a preference, not a business record.';

-- Keeps trg_set_updated_at wired onto every table with an updated_at column; idempotent.
SELECT install_updated_at_triggers();
