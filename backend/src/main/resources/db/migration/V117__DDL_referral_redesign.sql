ALTER TABLE referrals DROP CONSTRAINT referrals_status_check;
ALTER TABLE referrals ADD CONSTRAINT referrals_status_check
    CHECK (status IN ('pending', 'qualified', 'held', 'rewarded', 'rejected', 'clawed-back'));

ALTER TABLE referrals
    ADD COLUMN track                  text CHECK (track IN ('owner', 'seeker')),
    ADD COLUMN hold_until             timestamptz,
    ADD COLUMN auto_reason            text,
    ADD COLUMN granted_at             timestamptz,
    ADD COLUMN referred_device_id_hash text;

ALTER TABLE referral_codes
    ADD COLUMN referrer_device_id_hash text;

ALTER TABLE properties
    ADD COLUMN featured_days integer CHECK (featured_days IS NULL OR featured_days BETWEEN 1 AND 90);

UPDATE referrals
   SET granted_at = coalesce(qualified_at, handled_at, at)
 WHERE status IN ('qualified', 'rewarded');

CREATE INDEX idx_referrals_held ON referrals (hold_until) WHERE status = 'held';
CREATE INDEX idx_referrals_granted ON referrals (granted_at) WHERE status IN ('qualified', 'rewarded');
CREATE INDEX idx_referrals_qualified_property ON referrals (qualified_property_id)
    WHERE qualified_property_id IS NOT NULL;

COMMENT ON COLUMN referrals.track IS
    'Which first event decided the reward: owner (first listing verified) or seeker (first contact request accepted). NULL until it happens, and on rows that predate the tracks, which earn owner contacts.';
COMMENT ON COLUMN referrals.hold_until IS
    'While status is held: when the hourly sweep re-checks the referral and either grants or rejects it.';
COMMENT ON COLUMN referrals.auto_reason IS
    'Machine reason for the last automatic decision (system handled_by): high_risk, cap_reached, referee_suspended, listing_taken_down, verification_revoked, clawback_window.';
COMMENT ON COLUMN referrals.granted_at IS
    'When the referral began earning its reward; starts the automatic clawback window.';
COMMENT ON COLUMN referrals.referred_device_id_hash IS
    'Salted SHA-256 of the first-party X-Device-Id the referee redeemed with. PERSONAL DATA. Purpose: referral fraud detection only. Blanked after settings.fees.referralSignalRetentionDays.';
COMMENT ON COLUMN referral_codes.referrer_device_id_hash IS
    'Salted SHA-256 of the first-party X-Device-Id the referrer last opened the referral screen from. PERSONAL DATA. Purpose: referral fraud detection only. Blanked after settings.fees.referralSignalRetentionDays from signals_at.';
COMMENT ON COLUMN properties.featured_days IS
    'Overrides settings.fees.featuredDays for this listing after ownership verification: the window it stays Featured. NULL uses the platform default.';
