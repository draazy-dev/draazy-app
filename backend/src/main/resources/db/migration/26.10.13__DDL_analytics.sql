-- Analytics: demand signals, page-view telemetry, provider calls and error events.
-- No foreign keys here: an event stays true after its subject is gone, and a cascade would rewrite history.

-- No mobile number on purpose: the only reader is an aggregate count, so signed-out visitors stay anonymous.
-- `user_id` is set only when a session is signed in, to tell repeat visitors from distinct ones.
CREATE TABLE demand_signals (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind          text NOT NULL,
    locality_slug text,
    deal          text,
    bhk           text,
    property_id   uuid,
    user_id       uuid,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT demand_signals_kind_check CHECK (kind IN ('search', 'alert', 'view'))
);

-- Leads on the grouped column and carries the filtered one; DESC because every window reaches back from now.
CREATE INDEX demand_signals_locality_created_idx
    ON demand_signals (locality_slug, created_at DESC);

COMMENT ON TABLE demand_signals IS
    'Append-only record of demand: searches, alert requests and property views, by locality. '
    'Aggregate-only -- no contact details, and no foreign keys, so an event outlives its subject.';

COMMENT ON COLUMN demand_signals.kind IS
    'search | alert | view. Weighted by the reader, not here -- an alert request is a stronger '
    'signal than a view, but how much stronger is a reporting decision that may change.';

COMMENT ON COLUMN demand_signals.user_id IS
    'Null for signed-out visitors, which is the majority and is expected. Present only to tell '
    'repeat interest from distinct interest; never used to contact anybody.';

-- Raw grain, erasable and kept ninety days; reports read only the rollups so the sweep can never change an answer.
CREATE TABLE page_views (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    text NOT NULL,
    user_id       uuid,
    path          text NOT NULL,
    referrer_host text,
    device        text NOT NULL,
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    signed_in     boolean NOT NULL DEFAULT false,
    CONSTRAINT page_views_device_check CHECK (device IN ('mobile', 'tablet', 'desktop'))
);

COMMENT ON TABLE page_views IS
    'Raw page views, ninety-day retention. Read only by the rollup -- every report goes through '
    'page_view_daily and page_view_daily_paths.';

COMMENT ON COLUMN page_views.session_id IS
    'Opaque tab-scoped token minted in the browser and held in sessionStorage. It dies with the tab, '
    'so it is never correlated across visits and cannot accumulate into a profile. Deliberately not '
    'derived from the address, the User-Agent or the user id -- a token derived from those survives '
    'sign-out, which is exactly what a session-scoped token must not do.';

COMMENT ON COLUMN page_views.user_id IS
    'Null for signed-out viewers, which is the majority and is the measurement the Anonymous-surfers '
    'report is made of. Nulled rather than deleted on erasure: the view happened and is already '
    'counted in an aggregate naming nobody, so removing the row would falsify settled history to '
    'erase an identity that nulling removes just as completely. No foreign key -- a cascade would '
    'delete traffic history when an account closes.';

COMMENT ON COLUMN page_views.path IS
    'The matched route pattern (/property/:id), never the address bar. A query string carries search '
    'terms and referral identifiers and a fragment hides the same things, so a raw URL would put '
    'free-text personal data into the one table justified by holding none. Stripped server-side as '
    'well as client-side, because a convention the server does not enforce is one a forgotten call '
    'site quietly breaks.';

COMMENT ON COLUMN page_views.referrer_host IS
    'Host only (google.com), never the full referring URL -- on a search engine that URL contains the '
    'query the visitor typed. Null means a direct arrival or a browser that withheld the header; the '
    'two are not distinguishable and no report pretends otherwise. Internal referrers are dropped at '
    'the client, so an in-app hop does not appear as an inbound source.';

COMMENT ON COLUMN page_views.device IS
    'Viewport bucket: mobile, tablet or desktop. Deliberately not the User-Agent, which carries '
    'enough entropy to help fingerprint a viewer across sessions. Three buckets cannot single anybody '
    'out, and three buckets is all the device-split chart has ever shown.';

COMMENT ON COLUMN page_views.occurred_at IS
    'When the view happened, on the server clock. Distinct from insert time because the client '
    'batches: a whole session can arrive in one flush, and stamping every row with the insert time '
    'would compute that session duration as zero -- silently, for exactly the short sessions bounce '
    'rate is about. The client sends a relative offset and the server anchors it, so a wrong browser '
    'clock cannot file traffic under the wrong day.';

COMMENT ON COLUMN page_views.signed_in IS
    'True when the viewer was signed in. Feeds the signed-in/anonymous splits; names nobody.';

CREATE INDEX page_views_occurred_idx ON page_views (occurred_at DESC);
CREATE INDEX page_views_session_idx ON page_views (session_id, occurred_at);
CREATE INDEX page_views_user_idx ON page_views (user_id) WHERE user_id IS NOT NULL;

-- Session measures add per day but not per page, so day-grain and page-grain facts live in separate tables.
CREATE TABLE page_view_daily (
    day                    date PRIMARY KEY,
    sessions               bigint NOT NULL DEFAULT 0,
    anon_sessions          bigint NOT NULL DEFAULT 0,
    signed_in_sessions     bigint NOT NULL DEFAULT 0,
    pageviews              bigint NOT NULL DEFAULT 0,
    bounced_sessions       bigint NOT NULL DEFAULT 0,
    duration_seconds_total bigint NOT NULL DEFAULT 0,
    mobile_sessions        bigint NOT NULL DEFAULT 0,
    tablet_sessions        bigint NOT NULL DEFAULT 0,
    desktop_sessions       bigint NOT NULL DEFAULT 0,
    rolled_up_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE page_view_daily IS
    'Day-grain traffic, cut on IST. Holds no identity, so it is exempt from the ninety-day sweep and '
    'from erasure, and is kept indefinitely -- year-on-year comparison is the point.';

COMMENT ON COLUMN page_view_daily.day IS
    'IST calendar day. The platform reports in the timezone it operates in; bucketing on UTC would '
    'move five and a half hours of every evening into the following day.';

COMMENT ON COLUMN page_view_daily.bounced_sessions IS
    'Sessions with exactly one page view. Stored as a count rather than a rate so the reader divides '
    'it -- a stored rate cannot be re-aggregated across days without weighting, and the version that '
    'forgets to weight looks perfectly plausible.';

COMMENT ON COLUMN page_view_daily.duration_seconds_total IS
    'Sum, not average, for the same reason: averages do not add. A weekly mean is this total over the '
    'weeks sessions, which is unrecoverable from seven daily averages.';

COMMENT ON COLUMN page_view_daily.rolled_up_at IS
    'When this row was last recomputed. The rollup revisits recent days as late events arrive, so '
    'this is how a reader tells a settled day from one still moving.';

CREATE TABLE page_view_daily_paths (
    day            date NOT NULL,
    path           text NOT NULL,
    pageviews      bigint NOT NULL DEFAULT 0,
    anon_pageviews bigint NOT NULL DEFAULT 0,
    exits          bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (day, path)
);

COMMENT ON TABLE page_view_daily_paths IS
    'Page-grain traffic per IST day. Separate from page_view_daily because session measures are '
    'additive per day but not per page -- a six-page session is one session and six page views.';

COMMENT ON COLUMN page_view_daily_paths.exits IS
    'Sessions whose last page view of the day was this path. The drop-off funnel is built from this: '
    'it names where people stop, which is the one thing a pageview count cannot say.';

CREATE INDEX page_view_daily_paths_day_idx ON page_view_daily_paths (day DESC);

-- Counts sessions, not page views, so a source is not weighted by how much each arrival goes on to read.
CREATE TABLE page_view_daily_referrers (
    day            date NOT NULL,
    referrer_host  text NOT NULL,
    sessions       bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (day, referrer_host)
);

COMMENT ON TABLE page_view_daily_referrers IS
    'Sessions per referring host per IST day. Identity-free, kept indefinitely, and the only source '
    'the traffic-sources report reads -- see V96 for why no report may read page_views directly.';

COMMENT ON COLUMN page_view_daily_referrers.referrer_host IS
    'Host of the page the session arrived from, or the empty string for a direct arrival. Stored as '
    'a sentinel rather than NULL because it is half of the primary key, and because "direct" is a '
    'real answer the chart shows rather than an absence: it is the bucket for a typed address, a '
    'bookmark, and a browser that withheld the header, which are not distinguishable and which no '
    'report claims to distinguish.';

COMMENT ON COLUMN page_view_daily_referrers.sessions IS
    'Sessions, not page views. A visitor arrived from one place, so counting views would weight an '
    'arrival by how much it went on to read -- and in a share-of-total chart that would look like '
    'reach.';

CREATE INDEX page_view_daily_referrers_day_idx ON page_view_daily_referrers (day DESC);

-- Never holds a body, OTP, link or key: `recipient` is masked and `recipient_hash` is for exact-match search only.
CREATE TABLE provider_call (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider       text        NOT NULL CHECK (provider IN ('zeptomail', 'whatsapp', 'cashfree')),
    operation      text        NOT NULL,
    outcome        text        NOT NULL CHECK (outcome IN ('ok', 'failed', 'skipped')),
    recipient      text,
    recipient_hash text,
    reference      text,
    detail         text,
    duration_ms    integer,
    created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
    trace_id       text
);

CREATE INDEX idx_provider_call_created ON provider_call (created_at DESC);
CREATE INDEX idx_provider_call_provider ON provider_call (provider, created_at DESC);
CREATE INDEX idx_provider_call_recipient ON provider_call (recipient_hash) WHERE recipient_hash IS NOT NULL;
CREATE INDEX idx_provider_call_reference ON provider_call (reference) WHERE reference IS NOT NULL;

-- `last_user_id` is a bare uuid with no FK so erasing a user never has to touch it.
CREATE TABLE error_event (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint   text        NOT NULL UNIQUE,
    source        text        NOT NULL CHECK (source IN ('api', 'job', 'web')),
    level         text        NOT NULL DEFAULT 'error',
    error_type    text,
    message       text,
    stack         text,
    path          text,
    http_method   text,
    http_status   integer,
    build         text,
    user_role     text,
    last_user_id  uuid,
    last_trace_id text,
    context       jsonb       NOT NULL DEFAULT '{}',
    occurrences   integer     NOT NULL DEFAULT 1,
    first_seen    timestamptz NOT NULL DEFAULT now(),
    last_seen     timestamptz NOT NULL DEFAULT now(),
    resolved_at   timestamptz,
    resolved_by   uuid
);

CREATE INDEX idx_error_event_last_seen ON error_event (last_seen DESC);
CREATE INDEX idx_error_event_source_last_seen ON error_event (source, last_seen DESC);

SELECT install_updated_at_triggers();
