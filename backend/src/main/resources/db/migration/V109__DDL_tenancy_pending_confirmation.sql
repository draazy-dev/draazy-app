-- A rent deal close now proposes a tenancy that the named tenant must confirm from their own account.
-- `pending` waits for that answer; `declined` is a tenancy that never became active (the tenant said no,
-- or the owner reopened the deal first). `tenant_mobile` is the number the owner named, which the
-- confirming account's verified mobile has to match.
DO $$
DECLARE
    old_check text;
BEGIN
    FOR old_check IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'tenancies'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%terminated%'
    LOOP
        EXECUTE format('ALTER TABLE tenancies DROP CONSTRAINT %I', old_check);
    END LOOP;
END $$;

ALTER TABLE tenancies
    ADD CONSTRAINT tenancies_status_check
    CHECK (status IN ('pending','active','ended','terminated','declined'));

ALTER TABLE tenancies ADD COLUMN tenant_mobile text;

CREATE UNIQUE INDEX uq_tenancies_pending_per_property
    ON tenancies (property_id)
    WHERE status = 'pending';
