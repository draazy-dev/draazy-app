-- When the current tenant was named: a tenant sees only receipts minted from then on, never a predecessor's.
ALTER TABLE managed_properties ADD COLUMN tenant_since timestamptz;

UPDATE managed_properties SET tenant_since = updated_at WHERE tenant_mobile IS NOT NULL;

CREATE INDEX idx_managed_properties_tenant_mobile ON managed_properties (tenant_mobile)
    WHERE tenant_mobile IS NOT NULL;
