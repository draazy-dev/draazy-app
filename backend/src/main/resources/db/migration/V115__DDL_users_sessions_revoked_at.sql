ALTER TABLE users ADD COLUMN sessions_revoked_at timestamptz;
COMMENT ON COLUMN users.sessions_revoked_at IS
    'Set whenever every refresh token is revoked (logout, suspension, archive, token theft). The bearer filter refuses access tokens issued before it, so those events end access at once instead of up to 15 minutes later.';
