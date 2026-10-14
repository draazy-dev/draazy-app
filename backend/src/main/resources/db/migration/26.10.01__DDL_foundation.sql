-- Foundation: extensions, updated_at trigger machinery, settings, platform_fees, audit_log.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Public listing search forgives misspelt place names with word_similarity.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rewires trg_set_updated_at on every table with updated_at; each later migration ends by calling this.
CREATE OR REPLACE FUNCTION install_updated_at_triggers() RETURNS void AS $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema
         AND t.table_name  = c.table_name
         AND t.table_type  = 'BASE TABLE'
        WHERE c.table_schema = 'public'
          AND c.column_name  = 'updated_at'
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_set_updated_at ON %I;
             CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
            r.table_name, r.table_name);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE settings (
    key        text PRIMARY KEY,
    value      jsonb        NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now()
);

-- stamp_duty/registration are NULL for rent: they are computed per agreement (catalog.fee.LeaveAndLicenceCharges),
-- no flat figure exists. The frontend feesProvider must pass null through, not coerce it to 0.
CREATE TABLE platform_fees (
    deal          text PRIMARY KEY CHECK (deal IN ('buy','rent')),
    brokerage     bigint NOT NULL DEFAULT 0,
    platform_fee  bigint NOT NULL DEFAULT 0,
    stamp_duty    bigint,
    registration  bigint,
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN platform_fees.stamp_duty IS
    'Published stamp duty, whole rupees. NULL = not a flat figure, computed per agreement (D163); see catalog.fee.LeaveAndLicenceCharges.';
COMMENT ON COLUMN platform_fees.registration IS
    'Published registration fee, whole rupees. NULL = depends on the registering body, computed per agreement (D163): Rs 1000 municipal / Rs 500 rural.';

-- Rows are immutable (no updated_at); actor/checker are server-resolved handles, never client-supplied.
CREATE TABLE audit_log (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor      text,
    actor_role text CHECK (actor_role IN ('buyer','owner','staff','manager','admin')),
    action     text NOT NULL,
    entity     text,
    entity_id  text,
    checker    text,
    metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
    at         timestamptz NOT NULL DEFAULT now()
);

-- Back-office reads are a filter plus newest-first order; idx_audit_log_entity stays for single-row history.
CREATE INDEX idx_audit_log_entity   ON audit_log (entity, entity_id);
CREATE INDEX idx_audit_log_at       ON audit_log (at DESC);
CREATE INDEX idx_audit_log_actor_at ON audit_log (actor, at DESC);
CREATE INDEX idx_audit_log_entity_at ON audit_log (entity, at DESC);

SELECT install_updated_at_triggers();
