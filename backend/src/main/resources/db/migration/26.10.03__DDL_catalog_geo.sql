-- Catalog geography: cities, waitlist, localities, societies and society follows.

CREATE TABLE cities (
    slug          text PRIMARY KEY,
    name          text NOT NULL,
    live          boolean NOT NULL DEFAULT false,
    listing_count integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Length ceilings mirror CityWaitlistCreateRequest: this unauthenticated write stays bounded without the annotation.
CREATE TABLE city_waitlist (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile     text NOT NULL CHECK (mobile ~ '^[6-9][0-9]{9}$'),
    city       text NOT NULL,   -- free text: a not-yet-registered city
    email      text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT city_waitlist_city_len_check CHECK (length(city) <= 120),          -- mirrors @Size(max = 120)
    CONSTRAINT city_waitlist_email_len_check CHECK (email IS NULL OR length(email) <= 254)  -- mirrors @Size(max = 254)
);

-- Unique on lower(city): city is free text, so "Mumbai" and "mumbai" must collide. Must stay an INDEX (expression);
-- CityWaitlistRepository#insertIfAbsent infers ON CONFLICT (mobile, lower(city)) from it.
CREATE UNIQUE INDEX uq_city_waitlist_mobile_city
    ON city_waitlist (mobile, lower(city));

CREATE TABLE localities (
    slug          text PRIMARY KEY,
    name          text NOT NULL,
    city          text NOT NULL DEFAULT 'Pune',
    listing_count integer NOT NULL DEFAULT 0,
    avg_rent_psf  numeric,
    avg_buy_psf   numeric,
    rate_per_sqft numeric,
    avg_rent      bigint,                      -- absolute monthly INR
    demand        integer CHECK (demand BETWEEN 0 AND 100),
    focus         text CHECK (focus IN ('Buy','Rent','Both')),
    lat           double precision,
    lng           double precision,
    active        boolean NOT NULL DEFAULT true,
    about         text,
    connectivity  jsonb NOT NULL DEFAULT '[]'::jsonb,
    highlights    jsonb NOT NULL DEFAULT '[]'::jsonb,
    price_trends  jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    place_id      text,
    archived_at   timestamptz
);
CREATE INDEX idx_localities_city ON localities (city) WHERE active = true;
-- Localities come from Google Places; retired rows keep their slug so
-- existing bindings keep working.
CREATE UNIQUE INDEX uq_localities_place_id ON localities (place_id) WHERE place_id IS NOT NULL;

-- mint_origin stays NULL where never recorded: unknown, not "no demand". It is a separate axis from source.
-- merged_into is a pointer, not a move, so a merge is undoable; SocietyMergeService refuses chains (one hop only).
CREATE TABLE societies (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                  text NOT NULL UNIQUE,
    name                  text NOT NULL,
    builder               text,
    locality_slug         text REFERENCES localities(slug),
    lat                   double precision,
    lng                   double precision,
    place_id              text,
    year                  integer,
    towers                integer,
    units                 integer,
    occupancy             numeric,
    maintenance_per_sqft  numeric,
    parking_ratio         numeric,
    lifts                 integer,
    security              text,
    water                 text,
    power                 text,
    pet_policy            text,
    veg_policy            text,
    rera                  text,
    registration          boolean NOT NULL DEFAULT false,
    conveyance            boolean NOT NULL DEFAULT false,
    amenities             jsonb NOT NULL DEFAULT '[]'::jsonb,
    source                text CHECK (source IN ('curated','rera','community')),
    mint_origin           text,
    created_by            uuid REFERENCES users(id),
    merged_into           uuid REFERENCES societies(id),
    merged_at             timestamptz,
    merged_by             uuid REFERENCES users(id),
    admin_note            text,
    listing_count         integer NOT NULL DEFAULT 0,
    follower_count        integer NOT NULL DEFAULT 0,
    avg_rating            numeric,
    review_count          integer NOT NULL DEFAULT 0,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    archived_at           timestamptz,
    -- Enumerated in the DB so a typo'd value cannot silently never match.
    CONSTRAINT ck_society_mint_origin CHECK (mint_origin is null or mint_origin in ('demand', 'listing')),
    CONSTRAINT ck_society_merge_not_self CHECK (merged_into is distinct from id),
    CONSTRAINT ck_society_merged_trio CHECK (num_nonnulls(merged_into, merged_at, merged_by) in (0, 3))
);
CREATE INDEX idx_societies_locality ON societies (locality_slug);

-- Partial: the candidates queue is a handful of rows against the whole catalogue.
create index idx_society_candidates
    on public.societies (created_at desc)
    where source = 'community' and merged_into is null and archived_at is null;

-- A Google Place identifies at most one live society; retired rows release their Place IDs.
create unique index uq_societies_place_id on societies (place_id) where place_id is not null;

COMMENT ON COLUMN societies.archived_at IS
    'Set when the row was retired from the public catalogue; existing bindings stay, new ones are refused.';

-- One partial index serves both readers of merged_into: the read-side union and the ops merge list.
create index idx_society_merged_into
    on public.societies (merged_into)
    where merged_into is not null;

CREATE TABLE society_follows (
    user_id    uuid NOT NULL REFERENCES users(id),
    society_id uuid NOT NULL REFERENCES societies(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, society_id)
);

-- Serves GET /me/societies/following: one user's follows in created_at order, which the primary key cannot sort.
create index if not exists idx_society_follows_user_created
    on society_follows (user_id, created_at desc);

-- These counters are unmaintained: no writer, and they count every property rather than approved, unarchived ones.
-- Counts are computed on read; the columns are kept only because something seeded them.
COMMENT ON COLUMN localities.listing_count IS
    'UNMAINTAINED -- no writer. Counts are computed on read (decision D7.2). Do not trust this value.';
COMMENT ON COLUMN societies.listing_count IS
    'UNMAINTAINED -- no writer. Counts are computed on read (decision D7.2). Do not trust this value.';
COMMENT ON COLUMN societies.follower_count IS
    'UNMAINTAINED -- no writer. Counts are computed on read (decision D7.2). Do not trust this value.';
COMMENT ON COLUMN societies.avg_rating IS
    'UNMAINTAINED -- reviews are Engagement-slice territory. Computed on read, reads 0 until then.';
COMMENT ON COLUMN societies.review_count IS
    'UNMAINTAINED -- reviews are Engagement-slice territory. Computed on read, reads 0 until then.';
COMMENT ON COLUMN cities.listing_count IS
    'UNMAINTAINED -- no writer. Counts are computed on read (decision D7.2). Do not trust this value.';

COMMENT ON COLUMN societies.security IS
    'Security arrangement, free text (e.g. "3-tier + CCTV"). Was boolean until V15/spec fix S25.';

comment on column public.societies.place_id is
    'Google Place id for the society, when a resident''s approved location fix supplied one. '
    'The only Place field persisted besides lat/lng.';

comment on column public.societies.created_by is
    'The member who minted this society, for community-sourced rows. Null for curated and RERA '
    'imports, which nobody in particular typed in. Kept so an operator reviewing a candidate can '
    'ask the person who added it, and so a single account minting fifty societies is visible.';

comment on column public.societies.mint_origin is
    'What human action minted this society: ''demand'' (a searcher looked for the building and it '
    'was not in the catalogue) or ''listing'' (somebody posting a flat could not find their '
    'society). NOT the same axis as `source`, and deliberately named so they cannot be confused: '
    '`source` says where the row came from as a data record (curated / rera / community) and is '
    'what a reader weighs for trustworthiness; `mint_origin` says which human action produced it '
    'and is what ops reads to find unserved demand. Every row with a mint_origin has '
    'source = ''community''. Null means not recorded -- true of all curated and RERA rows, which '
    'nobody minted, and of every community row created before V108, whose surface was not captured. '
    'Treat null as unknown, never as "not demand".';

comment on column public.societies.merged_into is
    'The surviving society this duplicate was merged into, or null. A pointer, not a move: every '
    'row in the nine tables that reference societies(id) stays where it is, and the reads union the '
    'two societies together. That is what makes a merge undoable -- rewriting properties.society_id '
    'would not be, because nothing would record which listings had moved.';

comment on column public.societies.merged_at is
    'When the merge was recorded. Moves with merged_into and merged_by via ck_society_merged_trio.';

comment on column public.societies.merged_by is
    'The operator who merged it. A merge with no signature is a decision nobody made, and the day '
    'two operators disagree about which of two rows is the real society it is the only way to know '
    'who to ask. See merged_at.';

comment on column public.societies.admin_note is
    'Ops'' free-text note about this society -- why a claim is stuck, what the secretary said, what '
    'to check next. Internal: served only on /admin/societies/{slug} and deliberately absent from '
    'the public Society response, because it is moderator prose about a named building and often '
    'about the people in it. Null means no note; a cleared note is stored as null rather than '''', '
    'so "never had one" and "had one that was deleted" cannot render differently.';

SELECT install_updated_at_triggers();
