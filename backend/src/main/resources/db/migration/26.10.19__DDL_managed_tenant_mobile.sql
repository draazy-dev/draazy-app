-- The tenant's own number is what links them to the owner's rent record; nullable for rows tracked before it existed.
ALTER TABLE managed_properties
    ADD COLUMN tenant_mobile text
        CONSTRAINT managed_properties_tenant_mobile_check CHECK (tenant_mobile ~ '^[6-9][0-9]{9}$');
