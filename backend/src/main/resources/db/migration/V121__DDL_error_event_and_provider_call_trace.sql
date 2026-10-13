-- One row per distinct error (fingerprint), counted rather than repeated. Every string is scrubbed of
-- PII and credentials before it reaches this table; last_user_id is a bare uuid with no FK so erasing a
-- user never has to touch it.
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

ALTER TABLE provider_call ADD COLUMN trace_id text;
