-- Tenancy & finance. Online rent collection is deliberately not modelled (no rent_payments, rent_mandates or
-- payout_accounts): tenancies is a lettings fact, not a money path.


-- Soft-delete triplet: the ledger is reconciled against bank statements and tax returns, so rows must never vanish.
CREATE TABLE transactions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id    uuid NOT NULL REFERENCES properties(id),
    owner_id       uuid NOT NULL REFERENCES users(id),
    type           text NOT NULL CHECK (type IN ('income','expense')),
    category       text,
    amount         bigint NOT NULL,
    date           date NOT NULL,
    note           text,
    recurring      text NOT NULL DEFAULT 'none' CHECK (recurring IN ('none','monthly','quarterly','yearly')),
    archived       boolean NOT NULL DEFAULT false,
    archived_at    timestamptz,
    archive_reason text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_property_agg
    ON transactions (property_id, date) INCLUDE (type, amount)
    WHERE archived = false;

-- /dues reads only the recurring rows, a small minority of the ledger.
CREATE INDEX idx_transactions_recurring ON transactions (property_id, recurring)
    WHERE archived = false AND recurring <> 'none';

-- No index on transactions.owner_id on purpose: every read is scoped by property_id (ownership is resolved upstream),
-- so no query could use it. owner_id is the row's author, not a filter key.


CREATE TABLE tenancies (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid NOT NULL REFERENCES properties(id),
    tenant_id   uuid NOT NULL REFERENCES users(id),
    owner_id    uuid NOT NULL REFERENCES users(id),
    rent        bigint,
    deposit     bigint,
    start_date  date,
    end_date    date,
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','ended','terminated','declined')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    tenant_mobile text
);

-- tenant_mobile is the number the owner named; the confirming account's verified mobile must match it.
CREATE UNIQUE INDEX uq_tenancies_pending_per_property
    ON tenancies (property_id)
    WHERE status = 'pending';

-- Partial unique: two active tenancies on one flat would be a double-let, while ended ones may accumulate.
-- A service-level check cannot survive two concurrent closes.
CREATE UNIQUE INDEX uq_tenancies_active_per_property
    ON tenancies (property_id)
    WHERE status = 'active';

-- No single-column (owner_id) or (tenant_id) indexes: they would be strict prefixes of these composites.
CREATE INDEX idx_tenancies_owner_status  ON tenancies (owner_id, status);
CREATE INDEX idx_tenancies_tenant_status ON tenancies (tenant_id, status);


-- Columns mirror the profile the UI collects: every input of the trust score needs its own column.
-- occupants is text, not a family size: 'Bachelor (Male)' is what owners and societies decide on.
CREATE TABLE tenant_profiles (
    user_id        uuid PRIMARY KEY REFERENCES users(id),
    name           text,
    occupation     text,

    income         bigint,

-- CHECK so an unrecognised value cannot silently drop a profile out of an owner's filter; matches the contract enum.
    occupants      text CHECK (occupants IN ('family', 'bachelor_male', 'bachelor_female', 'company_lease')),

    move_in        date,

    prior_landlord text,
    about          text,

    score          integer CHECK (score BETWEEN 0 AND 100),
    verified       boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Verified tenants first, then by score: the only ordering these rows are read in.
CREATE INDEX idx_tenant_profiles_screening ON tenant_profiles (verified DESC, score DESC);


-- Self-declared rental, deliberately apart from transactions (owner-scoped, 404-not-403) and tenancies:
-- user-typed and unverified, so it must never reach the Rent Passport.
CREATE TABLE tenant_rentals (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

-- Every read and write is scoped to the caller; there is no owner-side view of this table.
    tenant_id    uuid NOT NULL REFERENCES users(id),

-- Personal data: must stay classified in ErasureRetention and DataExportScope (ErasureCoverageTest enforces it).
    address      text NOT NULL,

-- bigint whole rupees, never float. The upper bound stops a typo becoming an absurd headline figure,
-- since monthly_rent * months_elapsed is displayed directly.
    monthly_rent bigint NOT NULL,
    CONSTRAINT tenant_rentals_rent_range CHECK (monthly_rent > 0 AND monthly_rent <= 10000000),

-- Nullable and not DEFAULT 0: zero and unknown are different answers.
    deposit      bigint,
    CONSTRAINT tenant_rentals_deposit_range CHECK (deposit IS NULL OR (deposit >= 0 AND deposit <= 100000000)),

-- Required: rent paid so far is months elapsed since this date times the rent.
    lease_start  date NOT NULL,

    lease_end    date,
    CONSTRAINT tenant_rentals_dates_ordered
        CHECK (lease_end IS NULL OR lease_end >= lease_start),

-- A typo in lease_start must not silently inflate every total; 1970 predates any plausible tenancy.
    CONSTRAINT tenant_rentals_start_sane CHECK (lease_start >= DATE '1970-01-01'),

-- Bounded here as well as in the DTO so writers that bypass the controller are held to it too.
    CONSTRAINT tenant_rentals_address_length CHECK (length(address) BETWEEN 1 AND 300),

-- 'ended' keeps the row: last year's rent backs last year's HRA claim.
    status       text NOT NULL DEFAULT 'active',
    CONSTRAINT tenant_rentals_status_chk CHECK (status IN ('active', 'ended')),

-- Soft delete; distinct from 'ended', which still counts.
    archived     boolean NOT NULL DEFAULT false,
    archived_at  timestamptz,
    archive_reason text,

    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_rentals_tenant
    ON tenant_rentals (tenant_id, lease_start DESC)
    WHERE archived = false;


-- Owner-confirmed 'I lived here' claim, kept apart from tenancies: many past stays per property would break
-- uq_tenancies_active_per_property, and a typed claim must not read as a signed agreement.
CREATE TABLE tenancy_declarations (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id  uuid        NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
    declarant_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    owner_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'confirmed', 'revoked')),
    lived_from   date,
    lived_to     date,
    decided_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

-- One standing claim per person per listing, so a revoked false claim cannot be re-filed immediately.
    CONSTRAINT uq_tenancy_declaration_per_declarant UNIQUE (property_id, declarant_id),

    CONSTRAINT tenancy_declarations_dates_check
        CHECK (lived_from IS NULL OR lived_to IS NULL OR lived_to >= lived_from)
);

CREATE INDEX idx_tenancy_declarations_property ON tenancy_declarations (property_id, status);


-- tenant_mobile is text: the tenant may be an unregistered mobile at draft time (resolved to a user on activation).
CREATE TABLE rent_agreements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id     uuid NOT NULL REFERENCES properties(id),
    owner_id        uuid NOT NULL REFERENCES users(id),
    tenant_mobile   text CHECK (tenant_mobile ~ '^[6-9][0-9]{9}$'),
    rent            bigint,
    deposit         bigint,
    start_date      date,
    duration_months integer,
    status          text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','e-sign-pending','registered','active','expired')),
    document_url    text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    service_request_id uuid REFERENCES service_requests(id),
    final_document_id  uuid REFERENCES documents(id),
    prepared_by        uuid REFERENCES users(id) ON DELETE SET NULL,
    verified_by        uuid REFERENCES users(id) ON DELETE SET NULL,
    renewal_reminded_at timestamptz
);
CREATE INDEX idx_rent_agreements_property ON rent_agreements (property_id);

CREATE UNIQUE INDEX uq_rent_agreements_request_tenant
    ON rent_agreements (service_request_id, tenant_mobile)
    WHERE service_request_id IS NOT NULL;

COMMENT ON COLUMN rent_agreements.prepared_by IS
    'The staff member whose final-document upload created the row. Never the verifier: '
    'RentAgreementService refuses registered from the same account (four eyes).';
COMMENT ON COLUMN rent_agreements.verified_by IS
    'The second staff member who checked the registered copy and moved the row to registered.';
COMMENT ON COLUMN rent_agreements.renewal_reminded_at IS
    'When the daily sweep told the parties this agreement is ending; null until then, so the reminder goes out once.';

CREATE INDEX idx_rent_agreements_owner ON rent_agreements (owner_id, created_at DESC);


-- Owner's private record, kept out of properties (moderated, searched, soft-deleted) whose invariants it would break.
-- Publishing creates a normal pending listing linked through published_listing_id; deleting never touches it.
CREATE TABLE managed_properties (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id              uuid NOT NULL REFERENCES users(id),
-- deal follows the properties convention (buy|rent), not the front end's 'sale', so publish is a pass-through.
    title                 text   NOT NULL,
    deal                  text   NOT NULL,
    property_type         text   NOT NULL,
    bhk                   numeric,
    price                 bigint NOT NULL,
    locality              text   NOT NULL,
    locality_slug         text,
    society               text,
    area                  numeric,
    area_unit             text   NOT NULL DEFAULT 'sqft',
    furnishing            text,
-- Server-controlled, never client-supplied: born private/managed; only publish moves it to public/published.
    visibility            text   NOT NULL DEFAULT 'private',
    status                text   NOT NULL DEFAULT 'managed',
    rented                boolean NOT NULL DEFAULT false,
    tenant_name           text,
    monthly_rent          bigint,
    due_day               integer,
    valuation             jsonb,
    published_listing_id  uuid REFERENCES properties(id),
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_managed_properties_owner_created ON managed_properties (owner_id, created_at DESC);

COMMENT ON TABLE managed_properties IS
    'An owner''s private property record (valuation, document passport, rent tracking) kept apart '
    'from the moderated `properties` catalogue. Private by default; publishing spawns a normal '
    'pending listing and links to it via published_listing_id rather than merging into it.';

-- Partial unique so a race between two ensureManagedForListing calls fails loudly instead of creating two records
-- for one flat; partial because unpublished rows (null) may legitimately repeat.
CREATE UNIQUE INDEX idx_managed_properties_published_listing
    ON managed_properties (published_listing_id)
    WHERE published_listing_id IS NOT NULL;

COMMENT ON INDEX idx_managed_properties_published_listing IS
    'One managed record per published listing. Partial: unpublished records have a null bridge and '
    'an owner may legitimately hold many. Backstop for the read-then-write race in the client-side '
    'bridge dedup (D32).';


-- Separate from documents (property_id NOT NULL) for pre-listing papers; CASCADE as managed records are hard-deleted.
-- No url column: a persisted URL would be a permanent bearer credential, so signed URLs are minted at read time.
CREATE TABLE managed_property_documents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    managed_property_id uuid NOT NULL REFERENCES managed_properties(id) ON DELETE CASCADE,
    category            text,
    file_name           text,
    storage_key         text NOT NULL,
    size_bytes          bigint,
    mime_type           text,                         -- the type the bytes prove, not the one declared
    uploaded_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_managed_property_documents_prop_uploaded
    ON managed_property_documents (managed_property_id, uploaded_at DESC);

COMMENT ON TABLE managed_property_documents IS
    'Papers attached to a property an owner tracks privately in the Owner Hub, which may never have '
    'been listed. Kept apart from `documents` so the property vault''s sharing and request logic can '
    'assume every row it holds belongs to a listing (V20, V32). Never shared with a buyer.';


-- Owner-asserted rent receipts. Every column but rent_month is a server-derived snapshot, so an issued
-- receipt keeps saying what it said even after the owner edits the rent, tenant or address.
CREATE TABLE managed_property_rent_receipts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

-- CASCADE: the managed record is hard-deleted, and a restrictive FK would make the Owner Hub remove button fail.
    managed_property_id uuid NOT NULL REFERENCES managed_properties(id) ON DELETE CASCADE,

-- 'YYYY-MM' text: fixed-width and zero-padded, so lexical order is chronological and needs no expression index.
-- Explicit character class instead of \d, which is a literal backslash-d unless standard_conforming_strings is off.
    rent_month          varchar(7) NOT NULL
        CONSTRAINT ck_managed_rent_receipt_month CHECK (rent_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),

-- Snapshots; > 0 because a zero-rupee receipt is not a receipt, and this backstops writers other than the service.
    amount              bigint NOT NULL CHECK (amount > 0),
    tenant_name         varchar(200) NOT NULL,
    landlord_name       varchar(200) NOT NULL,
    property_address    varchar(500) NOT NULL,

-- created_at doubles as the receipt date: the endpoint takes no date, so a received_at would only duplicate it.
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One receipt per property per month: the second 'Mark received' becomes a deterministic 409 even when two taps race.
-- Also serves the ledger read (managed_property_id, rent_month DESC).
CREATE UNIQUE INDEX uq_managed_rent_receipt_month
    ON managed_property_rent_receipts (managed_property_id, rent_month);


-- Keeps trg_set_updated_at wired onto every table with an updated_at column.
SELECT install_updated_at_triggers();
