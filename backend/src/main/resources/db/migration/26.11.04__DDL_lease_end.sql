-- Cleared by ManagedAgreementHomes whenever a renewal moves lease_end, so each term is reminded once.
ALTER TABLE managed_properties ADD COLUMN renewal_reminded_at timestamptz;

-- When the user said yes to a call about Draazy services; NULL means no. Staff lead lists read only this.
ALTER TABLE notification_preferences ADD COLUMN marketing_consent_at timestamptz;
