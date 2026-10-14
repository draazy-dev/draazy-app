-- Catalog listings: `properties` plus reels, photo hashes, photo requests and duplicate dismissals.
-- `properties` must be created before the tables that carry a foreign key to it.

CREATE TABLE properties (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                text UNIQUE,
    owner_id            uuid NOT NULL REFERENCES users(id),
    title               text NOT NULL,
    deal                text NOT NULL CHECK (deal IN ('buy','rent')),
    property_type       text NOT NULL,
    bhk                 numeric,
    price               bigint NOT NULL,
    price_unit          text CHECK (price_unit IN ('total','per-month')),
    deposit             bigint,
    maintenance         bigint,
    negotiable          boolean,
    area                numeric,
    area_unit           text DEFAULT 'sqft',
    carpet_area         numeric,
    built_up_area       numeric,
    super_built_up_area numeric,
    furnishing          text CHECK (furnishing IN ('unfurnished','semi-furnished','furnished')),
    floor               integer,
    total_floors        integer,
    facing              text,

    -- NULL means "not stated" and must not match a "Ready to move" search. The CHECK also guards backfills and imports.
    possession          text CONSTRAINT properties_possession_check
                          CHECK (possession IS NULL OR possession = ANY (ARRAY[
                              'ready-to-move'::text,
                              'new-launch'::text,
                              'under-construction'::text
                          ])),

    locality            text NOT NULL,          -- display; localitySlug link is soft (seed keys by name)
    locality_slug       text REFERENCES localities(slug),
    society_id          uuid REFERENCES societies(id),
    city                text NOT NULL DEFAULT 'Pune',
    lat                 double precision,
    lng                 double precision,
    address             text,
    pincode             text,
    rera_id             text,
    description         text,
    amenities           jsonb NOT NULL DEFAULT '[]'::jsonb,
    images              jsonb NOT NULL DEFAULT '[]'::jsonb,
    cover_image         text,
    floor_plan          text,
    video               text,

    -- `sold`/`rented` are set on deal close; search is floored to 'approved', so those listings drop out of it.
    status              text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','paused','rejected','flagged','archived','sold','rented')),
    -- Mirrors deals.status so catalogue reads need no join (catalog must not depend on deals); DealService
    -- keeps it in sync in the same transaction as every deal-status change.
    deal_status         text NOT NULL DEFAULT 'active'
                          CHECK (deal_status IN ('active','reserved','closed')),

    featured            boolean NOT NULL DEFAULT false,
    flag_reason         text,
    verified            boolean NOT NULL DEFAULT false,
    owner_verified      boolean NOT NULL DEFAULT false,
    ownership_verified  boolean NOT NULL DEFAULT false,
    docs_count          integer NOT NULL DEFAULT 0,
    views               integer NOT NULL DEFAULT 0,
    enquiries           integer NOT NULL DEFAULT 0,

    ownership_verified_at    timestamptz,
    ownership_verified_until timestamptz,

    posted_by_admin     boolean NOT NULL DEFAULT false,

    admin_pipeline      jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Price, furnishing and possession edits raise a re-check work item without touching `status`, so the listing
    -- stays in search; foundation-field edits still revert to pending.
    recheck_requested_at timestamptz,
    recheck_reason       text,

    -- Null means never confirmed; readers fall back to created_at. No backfill: it would claim a confirmation
    -- that never happened.
    last_confirmed_at   timestamptz,

    -- Both signals are nullable and non-unique: a collision is suspicious, not impossible, and ops decides.
    -- address_key is normalised in Java only, never client-supplied; an SQL expression would be a second rule.
    electricity_meter_no text,
    address_key          text,

    -- Digits-only comparison key for the duplicate probe; the raw number stays as the owner typed it.
    -- Written by MeterKey, never a client; MeterKey.MIN_DIGITS is the placeholder floor.
    electricity_meter_key text,

    -- Generated so ORDER BY can page on it and it cannot go stale; retuning the weights needs a migration.
    -- Must stay immutable (no now() or cross-table lookups), which is why freshness is not part of the score.
    quality_score smallint GENERATED ALWAYS AS (
        LEAST(100,
            -- Photos (25): a cover_image with an empty images[] counts as one photo.
            (CASE
                WHEN jsonb_array_length(COALESCE(images, '[]'::jsonb)) >= 3 THEN 25
                WHEN jsonb_array_length(COALESCE(images, '[]'::jsonb)) = 2 THEN 16
                WHEN jsonb_array_length(COALESCE(images, '[]'::jsonb)) = 1 THEN 8
                WHEN cover_image IS NOT NULL THEN 8
                ELSE 0
            END)

            + (CASE
                WHEN length(COALESCE(description, '')) >= 200 THEN 15
                WHEN length(COALESCE(description, '')) >= 100 THEN 12
                WHEN length(COALESCE(description, '')) >= 50 THEN 8
                WHEN length(COALESCE(description, '')) > 0 THEN 3
                ELSE 0
            END)

            -- Trust (20): a rental scores who the owner is; a sale scores whether they can prove ownership.
            + (CASE WHEN deal = 'rent' THEN
                (CASE WHEN owner_verified THEN 10 ELSE 0 END)
                + (CASE WHEN ownership_verified THEN 10 ELSE 0 END)
              ELSE
                (CASE WHEN ownership_verified THEN 10 ELSE 0 END)
                + (CASE WHEN docs_count >= 3 THEN 10 WHEN docs_count >= 1 THEN 5 ELSE 0 END)
              END)

            -- Completeness (25): 'unfurnished' scores less as it is the form default, weaker evidence of an answer.
            + (CASE WHEN deal = 'rent' THEN
                (CASE WHEN furnishing IS NULL THEN 0 WHEN furnishing = 'unfurnished' THEN 3 ELSE 5 END)
                + (CASE WHEN facing IS NOT NULL THEN 5 ELSE 0 END)
                + (CASE WHEN floor IS NOT NULL THEN 5 ELSE 0 END)
                + (CASE WHEN possession IS NOT NULL THEN 5 ELSE 0 END)
                + (CASE WHEN deposit IS NOT NULL THEN 5 ELSE 0 END)
              ELSE
                (CASE WHEN furnishing IS NULL THEN 0 WHEN furnishing = 'unfurnished' THEN 2 ELSE 4 END)
                + (CASE WHEN facing IS NOT NULL THEN 4 ELSE 0 END)
                + (CASE WHEN floor IS NOT NULL THEN 4 ELSE 0 END)
                + (CASE WHEN total_floors IS NOT NULL THEN 4 ELSE 0 END)
                + (CASE WHEN area IS NOT NULL THEN 4 ELSE 0 END)
                + (CASE WHEN possession IS NOT NULL THEN 5 ELSE 0 END)
              END)

            + (CASE
                WHEN jsonb_array_length(COALESCE(amenities, '[]'::jsonb)) >= 5 THEN 15
                WHEN jsonb_array_length(COALESCE(amenities, '[]'::jsonb)) >= 3 THEN 10
                WHEN jsonb_array_length(COALESCE(amenities, '[]'::jsonb)) >= 1 THEN 5
                ELSE 0
            END)
        )
    ) STORED,

    -- Every facet must be filtered server-side: one left in the browser leaves pages short and totals wrong.
    land_use text
        CHECK (land_use IN ('residential', 'commercial', 'industrial', 'agricultural', 'mixed')),

    -- NULL is unstated, distinct from 0 (new launch). No upper bound: the filter's 25 is an open-ended 25+.
    age_years integer CHECK (age_years >= 0),

    room text CHECK (room IN ('single', 'shared')),

    -- An empty array means no stated preference and must match every tenant filter, not none.
    tenants jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- NULL is unstated, not "no": the renter can ask.
    pets boolean,

    -- Generated so the key cannot drift from the label; mirrors COMMERCIAL_SUBTYPES in
    -- frontend/src/data/propertyTypes.js.
    commercial_use_key text GENERATED ALWAYS AS (
      CASE
        WHEN lower(coalesce(property_type, '')) LIKE '%office%' THEN 'office'
        -- Specific arrangements precede general ones so "Co-working Retail Hub" is not filed under retail.
        WHEN lower(coalesce(property_type, '')) LIKE '%co-working%'
          OR lower(coalesce(property_type, '')) LIKE '%coworking%' THEN 'coworking'
        WHEN lower(coalesce(property_type, '')) LIKE '%shop%'
          OR lower(coalesce(property_type, '')) LIKE '%showroom%' THEN 'shop'
        WHEN lower(coalesce(property_type, '')) LIKE '%retail%'
          OR lower(coalesce(property_type, '')) LIKE '%mall%' THEN 'retail'
        WHEN lower(coalesce(property_type, '')) LIKE '%warehouse%'
          OR lower(coalesce(property_type, '')) LIKE '%godown%' THEN 'warehouse'
        WHEN lower(coalesce(property_type, '')) LIKE '%industrial%'
          OR lower(coalesce(property_type, '')) LIKE '%factory%' THEN 'industrial'
        ELSE NULL
      END) STORED,

    -- NULL = never answered, 0 = none (a plot has no bathrooms); a default of 0 would erase that difference.
    -- The CHECK is open-ended: the wizard shows "4+" but a villa or an admin post can exceed it.
    bathrooms integer CHECK (bathrooms >= 0),

    parking integer CHECK (parking >= 0),

    balconies integer CHECK (balconies >= 0),

    archived            boolean NOT NULL DEFAULT false,
    archived_at         timestamptz,
    archive_reason      text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    -- Generated so the key cannot disagree with property_type; the first CASE match wins and NULL matches no filter.
    -- Tokens mirror SEARCH_TYPES and ALIASES in frontend/src/data/propertyTypes.js.
    property_type_key text GENERATED ALWAYS AS (
        CASE
            -- Commercial before land: "Commercial Plot" is commercial stock first.
            WHEN lower(coalesce(property_type, '')) LIKE '%office%'
              OR lower(coalesce(property_type, '')) LIKE '%shop%'
              OR lower(coalesce(property_type, '')) LIKE '%showroom%'
              OR lower(coalesce(property_type, '')) LIKE '%retail%'
              OR lower(coalesce(property_type, '')) LIKE '%commercial%'
              OR lower(coalesce(property_type, '')) LIKE '%warehouse%'
              OR lower(coalesce(property_type, '')) LIKE '%godown%'
              OR lower(coalesce(property_type, '')) LIKE '%industrial%'
              OR lower(coalesce(property_type, '')) LIKE '%co-working%'
              OR lower(coalesce(property_type, '')) LIKE '%coworking%' THEN 'commercial'

            -- House precedes villa so "Villa / House" lands here; tokens are full phrases, so "Penthouse" stays out.
            WHEN lower(coalesce(property_type, '')) LIKE '%independent house%'
              OR lower(coalesce(property_type, '')) LIKE '%row house%'
              OR lower(coalesce(property_type, '')) LIKE '%villa / house%' THEN 'house'

            -- Flat covers studio and penthouse; 'apartment' joins via the app's ALIASES table.
            WHEN lower(coalesce(property_type, '')) LIKE '%flat%'
              OR lower(coalesce(property_type, '')) LIKE '%studio%'
              OR lower(coalesce(property_type, '')) LIKE '%penthouse%'
              OR lower(coalesce(property_type, '')) LIKE '%apartment%' THEN 'flat'

            WHEN lower(coalesce(property_type, '')) LIKE '%villa%' THEN 'villa'

            -- Farm land before plot so a future plot token cannot capture it.
            WHEN lower(coalesce(property_type, '')) LIKE '%farm land%'
              OR lower(coalesce(property_type, '')) LIKE '%farmland%' THEN 'farmland'

            WHEN lower(coalesce(property_type, '')) LIKE '%open plot%'
              OR lower(coalesce(property_type, '')) LIKE '%plot%' THEN 'plot'

            ELSE NULL
        END
    ) STORED,

    -- Filter-only share kind; generated so it cannot drift from room.
    share_type text GENERATED ALWAYS AS (
        CASE WHEN room IS NOT NULL THEN 'flatmates' ELSE NULL END
    ) STORED,

    -- Free text, not an enum: the wizard's options are a product decision that will move.
    overlooking text,
    form_details jsonb,
    version bigint NOT NULL DEFAULT 0,
    resubmitted_at timestamptz,
    claim_link_opened_at timestamptz,
    claim_link_sent_at timestamptz,
    owner_confirmed_at timestamptz,
    review_started_at timestamptz,
    info_requested_at timestamptz,
    ownership_requested_at timestamptz,
    ownership_declined_at timestamptz,
    ownership_declined_reason varchar(300),
    available_on date,
    featured_days integer CHECK (featured_days IS NULL OR featured_days BETWEEN 1 AND 90),

    CONSTRAINT properties_form_details_object
        CHECK (form_details IS NULL OR
            (jsonb_typeof(form_details) = 'object' AND octet_length(form_details::text) <= 65536)),
    CONSTRAINT properties_owner_confirm_staff_only
        CHECK (owner_confirmed_at IS NULL OR posted_by_admin)
);

CREATE INDEX idx_properties_owner        ON properties (owner_id);
CREATE INDEX idx_properties_locality     ON properties (locality);
CREATE INDEX idx_properties_society      ON properties (society_id);
CREATE INDEX idx_properties_search ON properties (deal, property_type, city, price, bhk)
    WHERE archived = false AND status = 'approved';

CREATE INDEX idx_properties_recheck_pending
    ON properties (recheck_requested_at)
 WHERE recheck_requested_at IS NOT NULL;

-- Locality-scoped: the address key alone is not selective enough and every query pairs the two.
CREATE INDEX idx_properties_address_key ON properties (locality_slug, address_key)
    WHERE address_key IS NOT NULL;

-- The raw electricity_meter_no gets no index: both duplicate queries read the key and nothing else filters on a meter.
CREATE INDEX idx_properties_meter_key ON properties (electricity_meter_key)
    WHERE electricity_meter_key IS NOT NULL;

CREATE INDEX idx_properties_quality_score
    ON properties (quality_score DESC, created_at DESC)
    WHERE archived = false AND status = 'approved';

-- Only the jsonb facet earns an index (a btree cannot serve @>); btrees on low-cardinality facets buy nothing.
CREATE INDEX idx_properties_tenants ON properties USING gin (tenants jsonb_path_ops);

-- Leads with deal + status so it stays useful for the unfiltered page too; partial on the public-search floor.
CREATE INDEX idx_properties_type_key
    ON properties (deal, property_type_key)
    WHERE status = 'approved' AND archived = false;

CREATE INDEX idx_properties_commercial_use ON properties (commercial_use_key)
  WHERE status = 'approved' AND archived = false AND commercial_use_key IS NOT NULL;

CREATE INDEX idx_properties_info_requested ON properties (info_requested_at)
    WHERE info_requested_at IS NOT NULL;

COMMENT ON COLUMN properties.recheck_requested_at IS
    'Set when an owner edits a stays-live foundation field (price/furnishing/possession) on a '
    'listing that is publicly visible. The listing remains approved and searchable; this is the '
    'moderation work item, and its age is the SLA. Cleared when a moderator sets a status on the '
    'listing, and by revertToPending() — a full re-moderation supersedes a re-check (Q14).';

COMMENT ON COLUMN properties.recheck_reason IS
    'Human-readable list of the fields that raised the pending re-check, e.g. "price, furnishing". '
    'Accumulates across edits until a moderator clears it, so a moderator who arrives after three '
    'edits sees all three rather than only the last (Q14).';

COMMENT ON COLUMN properties.ownership_verified_at IS
    'When ops last accepted a complete evidence set for this listing (D190). The instant handed to '
    'VerificationAnnouncer, so the referral credit and the listing agree on when it happened.';

COMMENT ON COLUMN properties.ownership_verified_until IS
    'The earliest expiry among the documents the badge was granted on, or NULL when every one of '
    'them is a never-expiring registry or identity document. The badge is DERIVED from this rather '
    'than swept: a nightly job leaves a window in which a lapsed listing still shows verified, and '
    'a comparison against now() has no such window and nothing to backfill (D190).';

comment on column properties.last_confirmed_at is
    'When the owner last confirmed this listing is still available. Null = never confirmed; readers fall back to created_at.';

COMMENT ON COLUMN properties.quality_score IS
    'Listing completeness, 0-100, generated. Weights: photos 25, description 15, trust 20, '
    'completeness 25, amenities 15. Rent scores owner identity; buy scores ownership evidence. '
    'Retuning requires a migration - see V94 for why that is deliberate.';

COMMENT ON COLUMN properties.land_use     IS 'Permitted zoning for plots/farm land. NULL for buildings.';
COMMENT ON COLUMN properties.age_years    IS 'Construction age in years. NULL = unstated, 0 = new. No upper bound.';
COMMENT ON COLUMN properties.room         IS 'Flatmate room shape: single (private) or shared (per bed).';
COMMENT ON COLUMN properties.tenants      IS 'Accepted tenant types. Empty array = no stated preference = matches any filter.';
COMMENT ON COLUMN properties.pets         IS
    'Owner-declared pet policy. NULL is unstated and must render as "ask the owner", never as "not allowed"; the pet-friendly filter matches TRUE only, so an unstated listing is neither promised nor advertised.';

COMMENT ON COLUMN properties.property_type_key IS
    'Canonical filter key derived from the free-text property_type: commercial|flat|house|villa|farmland|plot, or NULL when the label is unrecognised. Generated -- never written directly. Mirrors SEARCH_TYPES in frontend/src/data/propertyTypes.js.';

COMMENT ON COLUMN properties.commercial_use_key IS 'Canonical commercial subtype: office|coworking|shop|retail|warehouse|industrial, or NULL for a listing that is not commercial or whose label names no known subtype. Generated from property_type. Mirrors COMMERCIAL_SUBTYPES in frontend/src/data/propertyTypes.js.';

COMMENT ON COLUMN properties.share_type IS
    'Canonical share kind: flatmates (states a room shape) | NULL (a whole unit). Generated from room -- never written directly, and filter-only: it is not on the wire. The client derives the same value from room for its chips, so a listing with a share_type matches ONLY the Flatmates chip, never Flat/House/Villa.';

COMMENT ON COLUMN properties.bathrooms IS 'Bathroom count. NULL = unstated, 0 = none. 4 is the wizard ceiling and reads as 4+.';
COMMENT ON COLUMN properties.parking   IS 'Dedicated parking slots conveyed with the unit. NULL = unstated, 0 = none. Distinct from the parking amenity tokens.';
COMMENT ON COLUMN properties.balconies IS 'Balcony count. NULL = unstated, 0 = none.';
COMMENT ON COLUMN properties.overlooking IS
    'What the home looks out onto -- garden, amenity, parking, main road. NULL = unstated. Distinct from facing, which is the compass direction.';
COMMENT ON COLUMN properties.form_details IS
    'Private owner/staff edit answers not represented by canonical listing columns. No media, identity credentials or verification status. Legacy combined addresses are not split heuristically.';
COMMENT ON COLUMN properties.available_on IS
    'Exact move-in date, IST calendar. The legacy now/15/30 bucket is derived from it on read; null when unstated.';
COMMENT ON COLUMN properties.featured_days IS
    'Overrides settings.fees.featuredDays for this listing after ownership verification: the window it stays Featured. NULL uses the platform default.';

CREATE TABLE property_live_gaps (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id      uuid        NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
    left_live_at     timestamptz NOT NULL,
    returned_live_at timestamptz
);
CREATE INDEX idx_property_live_gaps_property ON property_live_gaps (property_id, left_live_at);
CREATE UNIQUE INDEX uq_property_live_gaps_open ON property_live_gaps (property_id) WHERE returned_live_at IS NULL;
COMMENT ON TABLE property_live_gaps IS
    'Every stretch a listing was not approved and unarchived, written by a trigger so no code path can skip it.';

CREATE FUNCTION record_property_live_gap() RETURNS trigger AS $$
DECLARE
    was_live boolean := OLD.status = 'approved' AND NOT OLD.archived;
    is_live  boolean := NEW.status = 'approved' AND NOT NEW.archived;
BEGIN
    IF was_live AND NOT is_live THEN
        INSERT INTO property_live_gaps (property_id, left_live_at)
        VALUES (NEW.id, clock_timestamp())
        ON CONFLICT DO NOTHING;
    ELSIF is_live AND NOT was_live THEN
        UPDATE property_live_gaps SET returned_live_at = clock_timestamp()
        WHERE property_id = NEW.id AND returned_live_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_property_live_gaps
    AFTER UPDATE OF status, archived ON properties
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.archived IS DISTINCT FROM NEW.archived)
    EXECUTE FUNCTION record_property_live_gap();

CREATE TABLE property_verification_override_requests (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id   uuid        NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
    requested_by  uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    action        text        NOT NULL CHECK (action IN ('approve','reverse_reject')),
    reason        text        NOT NULL CHECK (length(btrim(reason)) >= 10),
    status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
    decided_by    uuid        REFERENCES users (id) ON DELETE RESTRICT,
    decided_at    timestamptz,
    decision_note text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT property_verification_override_checker_is_not_maker
        CHECK (decided_by IS NULL OR decided_by <> requested_by),
    CONSTRAINT property_verification_override_decision_is_whole
        CHECK ((status = 'pending') = (decided_by IS NULL AND decided_at IS NULL))
);

CREATE UNIQUE INDEX property_verification_override_one_pending
    ON property_verification_override_requests (property_id, action) WHERE status = 'pending';
CREATE INDEX idx_property_verification_override_queue
    ON property_verification_override_requests (status, created_at);

-- `locality_slug` is the feed filter key like every other locality reference; `locality` stays the caption as filmed.
CREATE TABLE reels (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id    uuid REFERENCES properties(id),
    title         text,
    locality      text,
    locality_slug text,
    price         bigint,
    deal          text CHECK (deal IN ('buy','rent')),
    poster        text,
    video         text,
    likes         integer NOT NULL DEFAULT 0,
    views         integer NOT NULL DEFAULT 0,
    tag           text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reels_listing ON reels (listing_id);
CREATE INDEX idx_reels_locality_slug ON reels (locality_slug);

-- Four 16-bit bands are a high-recall pre-filter (guaranteed only up to Hamming distance 3); hits are verified in Java.
-- Acceptable because the signal flags for ops and never blocks an owner. Generated so bands cannot drift from the hash.
CREATE TABLE property_photo_hashes (
    property_id uuid   NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
    hash        bigint NOT NULL,
    band0       int    GENERATED ALWAYS AS ((hash >> 48) & 65535) STORED,
    band1       int    GENERATED ALWAYS AS ((hash >> 32) & 65535) STORED,
    band2       int    GENERATED ALWAYS AS ((hash >> 16) & 65535) STORED,
    band3       int    GENERATED ALWAYS AS (hash & 65535) STORED,
    PRIMARY KEY (property_id, hash)
);

CREATE INDEX idx_pph_band0 ON property_photo_hashes (band0);
CREATE INDEX idx_pph_band1 ON property_photo_hashes (band1);
CREATE INDEX idx_pph_band2 ON property_photo_hashes (band2);
CREATE INDEX idx_pph_band3 ON property_photo_hashes (band3);

-- `decided_at` serves both resolved and declined; `declined` is terminal so the buyer is not left waiting.
-- CASCADE on property_id only: a request on a deleted listing is a dead nag, while users are soft-deleted.
CREATE TABLE photo_requests (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    requester_id uuid NOT NULL REFERENCES users(id),
    status       text NOT NULL DEFAULT 'pending'
                   CONSTRAINT photo_requests_status_check
                   CHECK (status IN ('pending', 'resolved', 'declined')),
    decided_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Not scoped by status: a resolved or declined request must still block a re-ask, or the count stops meaning
-- distinct people. Also the only real guard against two concurrent taps that both miss the service read.
CREATE UNIQUE INDEX uq_photo_requests_requester_property
    ON photo_requests (requester_id, property_id);

CREATE INDEX idx_photo_requests_property ON photo_requests (property_id);

-- Keyed on a hash of the sorted member ids, so a cluster that gains a member is a new signature and resurfaces.
-- Hashed because a btree entry over 2704 bytes errors at INSERT, which a joined uuid list reaches at ~73 members.
CREATE TABLE listing_duplicate_dismissals (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- sha-256 hex of the sorted member ids, written only by DuplicateClusterSignature.of. varchar, not char(64):
    -- char pads and compares ignoring trailing spaces, which is too forgiving for a key.
    cluster_signature varchar(64) NOT NULL,

    -- Readable form for debugging; deliberately not indexed. jsonb like every other list column on the platform.
    member_ids        jsonb       NOT NULL,

    -- Always from the JWT, never from a request body.
    dismissed_by      uuid        NOT NULL REFERENCES users (id),

    -- No dismissed_at or updated_at: a row is created once, so this extends BaseEntity, not AuditedEntity.
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- Unique: a dismissal is a verdict on a set, so two operators dismissing it is one verdict; the service upserts.
CREATE UNIQUE INDEX ux_listing_duplicate_dismissals_signature
    ON listing_duplicate_dismissals (cluster_signature);

SELECT install_updated_at_triggers();
