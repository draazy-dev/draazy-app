-- Only the SHA-256 of the one-tap link token is stored; the link itself exists only in the WhatsApp message.
CREATE TABLE flatmate_owner_notices (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id             uuid        NOT NULL REFERENCES flatmate_rooms (id) ON DELETE CASCADE,
    host_id             uuid        NOT NULL REFERENCES users (id),
    owner_mobile        varchar(10) NOT NULL,
    address_fingerprint text        NOT NULL,
    token_hash          text        NOT NULL UNIQUE,
    status              varchar(16) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'agreed', 'declined')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    responded_at        timestamptz,
    expires_at          timestamptz NOT NULL
);

CREATE INDEX idx_flatmate_owner_notices_host ON flatmate_owner_notices (host_id, created_at);
CREATE INDEX idx_flatmate_owner_notices_owner ON flatmate_owner_notices (owner_mobile, created_at);
CREATE INDEX idx_flatmate_owner_notices_room ON flatmate_owner_notices (room_id);
