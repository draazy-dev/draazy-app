-- A user's appeal against a rejected identity check. One row per appeal; the support ticket is the conversation.
CREATE TABLE identity_appeals (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id uuid        NOT NULL REFERENCES identity_verifications(id) ON DELETE CASCADE,
    ticket_id       uuid        REFERENCES support_tickets(id) ON DELETE SET NULL,
    status          text        NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','upheld','reopened','superseded')),
    note            text        NOT NULL,
    decided_by      uuid        REFERENCES users(id),
    decided_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_identity_appeals_verification ON identity_appeals (verification_id, created_at DESC);

-- The race guard behind the 409: two concurrent appeals cannot both open.
CREATE UNIQUE INDEX uq_identity_appeals_open ON identity_appeals (verification_id) WHERE status = 'open';

SELECT install_updated_at_triggers();
