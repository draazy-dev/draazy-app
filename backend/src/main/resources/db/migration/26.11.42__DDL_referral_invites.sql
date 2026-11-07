CREATE TABLE referral_invites (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    mobile      text        NOT NULL CHECK (mobile ~ '^[6-9][0-9]{9}$'),
    delivery    text        NOT NULL CHECK (delivery IN ('sent', 'open_whatsapp', 'skipped')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_invites_mobile ON referral_invites (mobile, created_at);
CREATE INDEX idx_referral_invites_referrer ON referral_invites (referrer_id, created_at);

CREATE TABLE referral_redeem_failures (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    ip_hash    text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_redeem_failures_user ON referral_redeem_failures (user_id, created_at);
CREATE INDEX idx_referral_redeem_failures_ip ON referral_redeem_failures (ip_hash, created_at) WHERE ip_hash IS NOT NULL;
