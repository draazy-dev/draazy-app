-- Requests inbox: a requester can withdraw a pending request, nudge the recipient, and clear a decided one.

-- One row per reminder sent; notified is false when the recipient had already been nudged in the last 24h.
CREATE TABLE request_reminders (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind         text NOT NULL CHECK (kind IN ('contact', 'visit', 'photo', 'flatmate', 'group', 'document', 'offer')),
    ref_id       uuid NOT NULL,
    requester_id uuid NOT NULL REFERENCES users(id),
    recipient_id uuid NOT NULL REFERENCES users(id),
    notified     boolean NOT NULL,
    sent_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_request_reminders_ref ON request_reminders (kind, ref_id, sent_at DESC);
CREATE INDEX idx_request_reminders_recipient_notified ON request_reminders (recipient_id, sent_at DESC) WHERE notified;
CREATE INDEX idx_request_reminders_ref_id ON request_reminders (ref_id);

-- Hides a decided request from the requester's sent box only; the request itself is untouched.
CREATE TABLE request_hidden (
    user_id   uuid NOT NULL REFERENCES users(id),
    kind      text NOT NULL CHECK (kind IN ('contact', 'visit', 'photo', 'flatmate', 'group', 'document', 'offer')),
    ref_id    uuid NOT NULL,
    hidden_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, ref_id)
);

-- Withdrawn flatmate interests are deleted from flatmate_requests;
-- this keeps them in the hourly budget and the re-ask wait.
CREATE TABLE flatmate_interest_withdrawals (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL REFERENCES users(id),
    kind         text NOT NULL,
    target_id    uuid NOT NULL,
    requested_at timestamptz NOT NULL,
    withdrawn_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_flatmate_interest_withdrawals_budget ON flatmate_interest_withdrawals (requester_id, requested_at);
CREATE INDEX idx_flatmate_interest_withdrawals_target
    ON flatmate_interest_withdrawals (requester_id, kind, target_id, withdrawn_at DESC);

SELECT install_updated_at_triggers();
