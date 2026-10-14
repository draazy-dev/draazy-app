-- Identity & access: users, auth material and the back-office controls deciding who may hold a session.

-- hide_number is per person, not per listing (the phone is the owner's); default false keeps existing approvals valid.
-- A flag reason is enforced by users_flag_reason_check so the invariant survives any write path.
CREATE TABLE users (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  text,
    mobile                text NOT NULL UNIQUE CHECK (mobile ~ '^[6-9][0-9]{9}$'),  -- schema: Mobile
    email                 text,
    password_hash         text,                                                     -- staff/admin only (StaffLoginRequest)
    role                  text NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer','owner','staff','manager','admin')),
    team                  text CHECK (team IN ('rental','legal','loans','interior','packers','valuation')),
    status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
    city                  text,
    -- Trust ladder (ADR-019): mobile_verified (L1) is the floor; verified is the
    -- opt-in badge (L2), a trust signal never a gate.
    mobile_verified       boolean NOT NULL DEFAULT false,
    verified              boolean NOT NULL DEFAULT false,
    verified_contact_only boolean NOT NULL DEFAULT false,  -- owner pref: accept L2-verified contacts only
    hide_number           boolean NOT NULL DEFAULT false,  -- owner pref: mask my number even after approval
    listings_count        integer NOT NULL DEFAULT 0,      -- denormalized (owners)
    avatar                text,
    joined_at             timestamptz NOT NULL DEFAULT now(),
    last_active           timestamptz,
    archived              boolean NOT NULL DEFAULT false,   -- soft-delete (never hard-delete users)
    archived_at           timestamptz,
    archive_reason        text,
    flagged               boolean NOT NULL DEFAULT false,
    flag_reason           text,
    flagged_at            timestamptz,
    flagged_by            uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    share_activity_status boolean NOT NULL DEFAULT true,
    share_read_receipts   boolean NOT NULL DEFAULT true,
    waiting_digest_at     timestamptz,
    sessions_revoked_at   timestamptz,

    CONSTRAINT users_flag_reason_check
        CHECK (flagged = false OR (flag_reason IS NOT NULL AND length(trim(flag_reason)) > 0))
);

CREATE INDEX idx_users_role   ON users (role);
CREATE INDEX idx_users_team   ON users (team) WHERE team IS NOT NULL;
CREATE INDEX idx_users_status ON users (status) WHERE archived = false;

-- The directory reads live users newest-first, optionally by role; partial on archived = false keeps it small.
CREATE INDEX idx_users_created ON users (created_at DESC) WHERE archived = false;
CREATE INDEX idx_users_role_created ON users (role, created_at DESC) WHERE archived = false;

-- q is a prefix search on purpose; text_pattern_ops makes LIKE 'x%' index-usable regardless of collation.
CREATE INDEX idx_users_name_prefix ON users (lower(name) text_pattern_ops);
CREATE INDEX idx_users_mobile_prefix ON users (mobile text_pattern_ops);

-- Partial: flagged accounts are rare, so only flagged = true rows are indexed.
CREATE INDEX idx_users_flagged ON users (flagged) WHERE flagged = true;

-- Partial and case-insensitive: at most one LIVE account per mailbox; archived rows keep addresses, so no plain UNIQUE.
-- Not CONCURRENTLY: Flyway runs migrations in a transaction.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_live_email_ci
    ON public.users (lower(email))
    WHERE archived = false AND email IS NOT NULL;

COMMENT ON INDEX public.uq_users_live_email_ci IS
    'At most one non-archived account per email address, compared case-insensitively. Partial on purpose: users are soft-deleted, so archived rows keep their addresses and must be allowed to repeat one. Do not replace with a total UNIQUE constraint; see migration V70 for why.';

COMMENT ON COLUMN users.sessions_revoked_at IS
    'Set whenever every refresh token is revoked (logout, suspension, archive, token theft). The bearer filter refuses access tokens issued before it, so those events end access at once instead of up to 15 minutes later.';

COMMENT ON COLUMN users.hide_number IS
    'Owner preference: keep my mobile masked even after I approve a contact request; reach me in-app instead.';

COMMENT ON COLUMN users.flagged IS
    'Internal moderation marker. Never rendered to the account holder or to any consumer surface; '
    'it is a note between back-office colleagues, not a status the platform acts on.';
COMMENT ON COLUMN users.flag_reason IS
    'What was noticed. Mandatory whenever flagged is true (users_flag_reason_check).';

COMMENT ON COLUMN users.status IS
    'active | suspended | archived. suspended: the account still exists and still appears in the '
    'directory, but cannot obtain a session -- a reversible moderation state. archived: soft '
    'deleted, hidden from the default directory, and set by PATCH /users/{id}/archive, which also '
    'sets the archived flag that every read path filters on. The two are independent columns and a '
    'row may legitimately be both.';

-- owner-consent is its own purpose so such a code can never be presented at /auth/login or burn a login send budget
-- (both are keyed on (mobile, purpose)).
CREATE TABLE otp_codes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile     text NOT NULL CHECK (mobile ~ '^[6-9][0-9]{9}$'),
    code_hash  text NOT NULL,
    purpose    text NOT NULL DEFAULT 'login'
                   CHECK (purpose IN ('login', 'owner-consent') OR purpose LIKE 'owner-consent:%'
                          OR purpose LIKE 'tenant-consent:%' OR purpose LIKE 'draft-approval:%'),
    attempts   integer NOT NULL DEFAULT 0,
    consumed   boolean NOT NULL DEFAULT false,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    requested_by uuid REFERENCES users (id) ON DELETE RESTRICT
);
CREATE INDEX idx_otp_codes_mobile ON otp_codes (mobile, purpose);
CREATE INDEX idx_otp_codes_created_at ON otp_codes (created_at);
CREATE INDEX idx_otp_codes_requested_by
    ON otp_codes (requested_by, created_at)
    INCLUDE (purpose)
    WHERE requested_by IS NOT NULL;

COMMENT ON COLUMN otp_codes.requested_by IS
    'The authenticated account that asked for this code, when one asked. Null for login and signup, '
    'where the caller is the recipient and has no session yet. Read only by the per-caller send '
    'budget, which is what stops one account spending a third-party flow''s whole hourly share.';

-- graced_count counts CONSECUTIVE graces on a rotation chain (a clean rotation resets it), so a flaky client never
-- accrues a forced sign-out while an attacker ping-pong, contested at every step, stays bounded.
CREATE TABLE refresh_tokens (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users(id),
    token_hash   text NOT NULL UNIQUE,
    rotated_from uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    revoked      boolean NOT NULL DEFAULT false,
    graced_count integer NOT NULL DEFAULT 0,
    expires_at   timestamptz NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

create index if not exists idx_refresh_tokens_expires_at on refresh_tokens(expires_at);

-- The grace walk resolves chains by rotated_from. Not unique: the service enforces one successor under a row lock.
create index if not exists idx_refresh_tokens_rotated_from on refresh_tokens(rotated_from);

-- A row only subtracts from the compiled-in role baseline (security/AccountPermissions retainAll); no row = not scoped.
-- Keyed by user_id (the JWT sub), kept out of the token so revocation takes effect on the next request.

CREATE TABLE back_office_permissions (
    user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    permissions jsonb       NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid        REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT back_office_permissions_is_array CHECK (jsonb_typeof(permissions) = 'array')
);

COMMENT ON TABLE back_office_permissions IS
    'Per-account narrowing of back-office access (D192/D13). One row scopes one staff or admin '
    'account; NO ROW is the normal state and means "not scoped -- the compiled-in role baseline '
    'applies". Resolved per request by security/AccountPermissions, which intersects this document '
    'with the baseline for the caller''s role, so the row can only ever subtract. It is never '
    'consulted instead of a @PreAuthorize role guard, only in addition to one.';

COMMENT ON COLUMN back_office_permissions.user_id IS
    'The account this document scopes. Also the primary key: an account has one permission document '
    'or none. Selected from the JWT ''sub'' of the signature-verified principal and from nothing '
    'else -- a document addressed by anything the client sends would be an allow-list the client '
    'could opt out of (V61).';

COMMENT ON COLUMN back_office_permissions.permissions IS
    'JSON array of back-office function names from security/BackOfficeFunctions. Effective atoms are derived per request.';

COMMENT ON COLUMN back_office_permissions.updated_by IS
    'The administrator who last wrote this document. Nullable and ON DELETE SET NULL: the record of '
    'who scoped an account must survive that administrator''s own account being removed, and losing '
    'the attribution is a smaller loss than losing the scoping.';

-- Only sha256(secret) is stored; the token is <id>.<secret> with id as an account-blind selector.
-- created_by RESTRICTs: who issued a credential is the fact a dispute turns on.

CREATE TABLE staff_invites (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  text        NOT NULL,
    created_by  uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    redeemed_at timestamptz,
    CONSTRAINT staff_invites_expires_after_issue CHECK (expires_at > created_at)
);

-- An administrator can reissue an invite (forgotten password, expired invite), so uniqueness is
-- "one OPEN invite per account". Reissue deletes the open row first.
CREATE UNIQUE INDEX uq_staff_invites_open_user ON staff_invites (user_id) WHERE redeemed_at IS NULL;

-- Partial: only open invites are ever listed.
CREATE INDEX idx_staff_invites_open
    ON staff_invites (expires_at)
    WHERE redeemed_at IS NULL;

COMMENT ON TABLE staff_invites IS
    'Single-use credential invites for back-office accounts (D206). One row per account minted '
    'through POST /users/staff. A row with redeemed_at IS NULL BLOCKS AUTHENTICATION for that '
    'account on every login path, exactly as an unapproved staff_account_approvals row does, and '
    'for the same reason: the account has no usable password yet and a passwordless account is '
    'still reachable over mobile OTP. NO ROW means the account is not subject to the invite flow, '
    'which is the state of every account created before this migration and of every consumer '
    'account. Read by identity/auth/AuthService, written and redeemed by '
    'identity/auth/StaffInviteService.';

COMMENT ON COLUMN staff_invites.id IS
    'Selector half of the token handed to the invitee (`<id>.<secret>`). Public by construction; it '
    'names no account, which is why it is safe to put in a token and why user_id is not the key.';

COMMENT ON COLUMN staff_invites.token_hash IS
    'sha256(secret) -- the secret half of the token, NEVER the token itself. Compared with '
    'MessageDigest.isEqual so the verify path leaks no timing signal about how much of a guess '
    'matched.';

COMMENT ON COLUMN staff_invites.created_by IS
    'The administrator who minted the account. Recorded for the audit trail only: this person is '
    'deliberately never told the token and cannot set the password, which is the whole of D206.';

COMMENT ON COLUMN staff_invites.redeemed_at IS
    'When the invitee set their own password. NULL means the invite is open, which blocks login. '
    'One-way and single-use: a redeemed invite is refused for the rest of its life.';

-- Staff sign-in is password + TOTP only, since mobile OTP would let a SIM swap bypass both factors.
-- totp_secret is AES-GCM ciphertext; totp_last_step rejects replays (a code is valid only for a later 30s step).
CREATE TABLE staff_credentials (
    user_id              uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    totp_secret          text,
    totp_confirmed_at    timestamptz,
    totp_last_step       bigint,
    recovery_code_hashes jsonb       NOT NULL DEFAULT '[]'::jsonb,
    failed_attempts      integer     NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_credentials_confirmed_has_secret
        CHECK (totp_confirmed_at IS NULL OR totp_secret IS NOT NULL)
);

COMMENT ON TABLE staff_credentials IS
    'Second factor and guess throttle for staff/admin sign-in. Written by identity/auth only.';

CREATE TABLE admin_bootstrap_runs (
    nonce  text PRIMARY KEY,
    ran_at timestamptz NOT NULL DEFAULT now()
);

-- An absent row means the defaults, not silence: column defaults mirror NotificationPreferenceService.effective.
-- quiet_start/end are text HH:mm (CHECKed) to match the wire; start = end means no quiet window.
CREATE TABLE notification_preferences (
    user_id             uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    email               boolean NOT NULL DEFAULT true,
    sms                 boolean NOT NULL DEFAULT false,
    whatsapp            boolean NOT NULL DEFAULT true,
    match_alerts        boolean NOT NULL DEFAULT true,
    quiet_hours_enabled boolean NOT NULL DEFAULT false,
    quiet_start         text    NOT NULL DEFAULT '22:00',
    quiet_end           text    NOT NULL DEFAULT '07:00',
    language            text    NOT NULL DEFAULT 'en',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notification_preferences_quiet_start_check
        CHECK (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT notification_preferences_quiet_end_check
        CHECK (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT notification_preferences_language_check
        CHECK (language IN ('en', 'hi', 'mr'))
);

COMMENT ON TABLE notification_preferences IS
    'One row per user; absent means the defaults in NotificationPreferenceService. Read by '
    'NotificationPublisher on every server-written notification (D94).';
COMMENT ON COLUMN notification_preferences.match_alerts IS
    'The master switch for saved-search/price alerts only. It does not silence transactional '
    'notifications -- an offer on your listing is not an alert you opted into, it is an event you '
    'are a party to, and a user who muted match alerts has not asked to stop hearing about those.';
COMMENT ON COLUMN notification_preferences.email IS
    'Channel switch. Carried and returned; NOT YET consulted by any server code, because nothing on '
    'the server sends email, SMS or WhatsApp today -- the Notifier port writes an in-app inbox row '
    'and nothing else. Persisting them now means the switches the user already sets survive the '
    'move off localStorage, and the first real sender inherits an answer instead of a migration.';
COMMENT ON COLUMN notification_preferences.language IS
    'The language the platform should address this user in. Same caveat as the channel switches: '
    'stored and returned, with no server-side renderer consuming it yet.';

-- Web-push endpoints a signed-in user registered; one row per browser/device.
CREATE TABLE push_subscriptions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   text NOT NULL UNIQUE,
    p256dh     text NOT NULL,
    auth       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user
    ON push_subscriptions (user_id, created_at DESC);

-- subject_digest = SHA-256(pepper || uuid) verifies a known id without being an enumerable index; mobile is not used.
-- Nothing cascades from users: the proof of erasure must outlive the account.
CREATE TABLE erasure_requests (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

-- NULLed at execution (NULL, not a sentinel UUID); subject_digest takes over.
    -- names anybody" is exactly what NULL means and a sentinel UUID would need its own explanation.
    subject_id     uuid REFERENCES users(id),

    subject_digest text        NOT NULL,

    status         text        NOT NULL DEFAULT 'pending',
    reason         text,                              -- the subject's own words, optional

    requested_at   timestamptz NOT NULL DEFAULT now(),

-- Kept in the clear: this half of the row is ops accountability.
    decided_by     uuid REFERENCES users(id),
    decided_at     timestamptz,
    decision_note  text,

    erased         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    retained       jsonb       NOT NULL DEFAULT '{}'::jsonb,

    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT erasure_requests_status_check
        CHECK (status IN ('pending', 'completed', 'rejected')),

-- Enforced here so a writer that forgets to NULL subject_id fails instead of leaving erased people identifiable.
    CONSTRAINT erasure_requests_completed_is_anonymous
        CHECK (status <> 'completed' OR subject_id IS NULL),

    CONSTRAINT erasure_requests_decided_is_attributed
        CHECK (status = 'pending' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

-- One live request per subject: a double tap must not record a second erasure that erased nothing.
CREATE UNIQUE INDEX uq_erasure_requests_live_subject
    ON erasure_requests (subject_id)
    WHERE status = 'pending' AND subject_id IS NOT NULL;

CREATE INDEX idx_erasure_requests_status_requested
    ON erasure_requests (status, requested_at DESC);

CREATE INDEX idx_erasure_requests_digest
    ON erasure_requests (subject_digest);

COMMENT ON TABLE erasure_requests IS
    'DPDP s.12(3) erasure requests. subject_id is live only while pending; a completed row is '
    'identified solely by subject_digest = SHA-256(pepper || subject uuid), which verifies a '
    'known id but cannot enumerate erased subjects. erased/retained hold counts and category '
    'names only.';

COMMENT ON COLUMN erasure_requests.retained IS
    'Category -> statutory basis for keeping it. Written at execution so the reason travels with '
    'the decision rather than living only in code that may later change.';

-- users.mobile must stay NOT NULL/UNIQUE/CHECKed after erasure, so ErasureService.pseudonymMobile writes a pseudonym
-- (computed in Java, one home for the rule) rather than relaxing the CHECK.

-- Storage deletes run after commit; a failed one stays queued here and a sweeper retries it, so
-- an erased or withdrawn identity image is never forgotten by a lost log line.
CREATE TABLE identity_storage_deletes (
    storage_key text        PRIMARY KEY,
    queued_at   timestamptz NOT NULL DEFAULT now(),
    attempts    integer     NOT NULL DEFAULT 0,
    last_error  text
);

-- identity_hash is a one-way HMAC (last 4 digits kept) and UNIQUE: one document, one badge; claimed_hash only warns.
-- Withdrawal keeps the row: it holds the attempt window and fraud tombstone, so files and claims are purged instead.
CREATE TABLE identity_verifications (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               uuid NOT NULL UNIQUE REFERENCES users(id),
    status                text NOT NULL CHECK (status IN ('pending','verified','rejected','revoked','withdrawn')),
    doc_type              text NOT NULL CHECK (doc_type IN ('aadhaar','pan','driving_licence','passport','voter_id')),
    claimed_number_last4  text,
    claimed_name          text,
    claimed_dob           date,
    claimed_hash          text,
    identity_hash         text UNIQUE,
    person_key            text,
    doc_last4             text,
    holder_name           text,
    holder_dob            date,
    consent_at            timestamptz NOT NULL,
    submitted_at          timestamptz NOT NULL DEFAULT now(),
    attempt_count         int NOT NULL DEFAULT 1,
    attempt_window_start  timestamptz NOT NULL DEFAULT now(),
    reviewer_id           uuid REFERENCES users(id),
    decided_at            timestamptz,
    rejection_reason      text CHECK (rejection_reason IN ('blurry','cropped','mismatch','expired','not_holder','unsupported','other','not_reviewed')),
    rejection_note        text,
    files_purged_at       timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    holder_dob_year_only  boolean NOT NULL DEFAULT false,
    liveness              text CHECK (liveness IN ('passed','bypassed','unavailable')),
    consent_notice_version text,
    revoked_at            timestamptz,
    revoked_by            uuid REFERENCES users(id),
    revocation_reason     text,
    consent_language      text CHECK (consent_language IN ('en','hi','mr')),
    claimed_by            uuid REFERENCES users(id),
    claimed_at            timestamptz,
    qa_sampled_at         timestamptz,
    qa_reviewed_by        uuid REFERENCES users(id),
    qa_reviewed_at        timestamptz,
    qa_outcome            text CHECK (qa_outcome IN ('confirmed','revoked')),
    liveness_challenge    text,
    number_overridden     boolean NOT NULL DEFAULT false,
    CONSTRAINT identity_verifications_revocation_is_whole
        CHECK ((status = 'revoked') = (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)),
    CONSTRAINT identity_verifications_revoker_is_not_subject
        CHECK (revoked_by IS NULL OR revoked_by <> user_id),
    CONSTRAINT identity_verifications_revocation_reason_length
        CHECK (revocation_reason IS NULL OR length(btrim(revocation_reason)) BETWEEN 10 AND 300),
    CONSTRAINT identity_verifications_claim_is_whole
        CHECK ((claimed_by IS NULL) = (claimed_at IS NULL)),
    CONSTRAINT identity_verifications_qa_is_whole
        CHECK ((qa_reviewed_by IS NULL) = (qa_reviewed_at IS NULL)
               AND (qa_reviewed_at IS NULL) = (qa_outcome IS NULL)),
    CONSTRAINT identity_verifications_qa_needs_sample
        CHECK (qa_reviewed_at IS NULL OR qa_sampled_at IS NOT NULL),
    CONSTRAINT identity_verifications_qa_checker_is_not_maker
        CHECK (qa_reviewed_by IS NULL OR reviewer_id IS NULL OR qa_reviewed_by <> reviewer_id),
    CONSTRAINT identity_verifications_qa_checker_is_not_subject
        CHECK (qa_reviewed_by IS NULL OR qa_reviewed_by <> user_id),
    CONSTRAINT identity_verifications_claimer_is_not_subject
        CHECK (claimed_by IS NULL OR claimed_by <> user_id),
    CONSTRAINT identity_verifications_qa_sample_needs_decision
        CHECK (qa_sampled_at IS NULL OR status IN ('verified','revoked','withdrawn')),
    CONSTRAINT identity_verifications_qa_revoke_matches_status
        CHECK (qa_outcome IS DISTINCT FROM 'revoked' OR status IN ('revoked','withdrawn')),
    CONSTRAINT identity_verifications_qa_revoker_is_qa_checker
        CHECK (qa_outcome IS DISTINCT FROM 'revoked' OR status <> 'revoked'
               OR revoked_by = qa_reviewed_by),
    CONSTRAINT ck_identity_verifications_liveness_challenge
        CHECK (liveness_challenge IN ('left', 'right', 'smile'))
);

CREATE INDEX idx_identity_verifications_queue ON identity_verifications (status, submitted_at);
CREATE INDEX idx_identity_verifications_claimed_hash ON identity_verifications (claimed_hash) WHERE claimed_hash IS NOT NULL;
CREATE INDEX idx_identity_verifications_person_key ON identity_verifications (person_key) WHERE person_key IS NOT NULL;
CREATE INDEX idx_identity_verifications_purge ON identity_verifications (decided_at) WHERE decided_at IS NOT NULL AND files_purged_at IS NULL;
CREATE INDEX idx_identity_verifications_qa_open ON identity_verifications (qa_sampled_at)
    WHERE qa_sampled_at IS NOT NULL AND qa_reviewed_at IS NULL;

COMMENT ON COLUMN identity_verifications.holder_dob_year_only IS
    'Older Aadhaar cards print only the year of birth; holder_dob is then YYYY-01-01 and this is true.';
COMMENT ON COLUMN identity_verifications.liveness IS
    'What the on-device pose checks reported: passed, bypassed after the stall timer, or unavailable. A reviewer signal, never a gate.';

CREATE TABLE identity_verification_files (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id uuid NOT NULL REFERENCES identity_verifications(id) ON DELETE CASCADE,
    kind            text NOT NULL CHECK (kind IN ('front','back','selfie')),
    storage_key     text NOT NULL,
    content_type    text NOT NULL,
    size_bytes      int NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (verification_id, kind)
);

-- The dedup 409 is recorded here, outside the rolled-back submit, so a dispute refers to a conflict
-- the server saw rather than taking a document number (which would make it an enumeration oracle).
CREATE TABLE identity_conflicts (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_type               text        NOT NULL,
    claimed_hash           text        NOT NULL,
    holder_verification_id uuid        REFERENCES identity_verifications(id) ON DELETE SET NULL,
    created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_identity_conflicts_user ON identity_conflicts (user_id, created_at DESC);

SELECT install_updated_at_triggers();
