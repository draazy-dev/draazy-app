-- Idempotent, as `postgres`; rollout order is docs/DEPLOY.md §2.1. `draazy_app` (runtime) gets rows only, so a
-- runtime-query flaw cannot run DDL. No password here: set it with \password draazy_app.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'draazy_app') THEN
        CREATE ROLE draazy_app LOGIN;
    END IF;
END
$$;

ALTER ROLE draazy_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- Cuts off a runaway query or a leaked open transaction instead of letting it hold locks.
ALTER ROLE draazy_app SET statement_timeout = '60s';
ALTER ROLE draazy_app SET idle_in_transaction_session_timeout = '60s';

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO draazy_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO draazy_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO draazy_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO draazy_app;
REVOKE ALL ON public.flyway_schema_history FROM draazy_app;

-- Tables a later migration creates are owned by `postgres`; without these the next deploy 500s on them.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO draazy_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO draazy_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO draazy_app;

-- Verify: every flag false, can_create false, owned_tables 0.
SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolconfig
FROM pg_roles WHERE rolname = 'draazy_app';

SELECT has_schema_privilege('draazy_app', 'public', 'CREATE') AS can_create,
       (SELECT count(*) FROM pg_tables WHERE tableowner = 'draazy_app') AS owned_tables;
