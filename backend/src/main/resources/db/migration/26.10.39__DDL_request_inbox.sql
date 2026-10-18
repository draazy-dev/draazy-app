-- Requests inbox: a requester can withdraw a pending request, nudge the recipient, and clear a decided one.
ALTER TABLE contact_requests DROP CONSTRAINT IF EXISTS contact_requests_status_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_status_check
    CHECK (status IN ('pending', 'approved', 'declined', 'expired', 'withdrawn'));

ALTER TABLE photo_requests DROP CONSTRAINT IF EXISTS photo_requests_status_check;
ALTER TABLE photo_requests ADD CONSTRAINT photo_requests_status_check
    CHECK (status IN ('pending', 'resolved', 'declined', 'withdrawn'));

ALTER TABLE flatmate_group_applications DROP CONSTRAINT IF EXISTS flatmate_group_applications_status_check;
ALTER TABLE flatmate_group_applications ADD CONSTRAINT flatmate_group_applications_status_check
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn'));

-- A cancelled visit reads as the visitor's own withdrawal or the owner's decline; the status alone cannot tell.
ALTER TABLE visits ADD COLUMN cancelled_by_visitor boolean NOT NULL DEFAULT false;

-- One row per reminder sent; notified is false when the recipient had already been nudged in the last 24h.
CREATE TABLE request_reminders (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind         text NOT NULL CHECK (kind IN ('contact', 'visit', 'photo', 'flatmate', 'group')),
    ref_id       uuid NOT NULL,
    requester_id uuid NOT NULL REFERENCES users(id),
    recipient_id uuid NOT NULL REFERENCES users(id),
    notified     boolean NOT NULL,
    sent_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_request_reminders_ref ON request_reminders (kind, ref_id, sent_at DESC);
CREATE INDEX idx_request_reminders_recipient_notified ON request_reminders (recipient_id, sent_at DESC) WHERE notified;

-- Hides a decided request from the requester's sent box only; the request itself is untouched.
CREATE TABLE request_hidden (
    user_id   uuid NOT NULL REFERENCES users(id),
    kind      text NOT NULL CHECK (kind IN ('contact', 'visit', 'photo', 'flatmate', 'group')),
    ref_id    uuid NOT NULL,
    hidden_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, ref_id)
);
