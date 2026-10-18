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

CREATE INDEX idx_request_reminders_ref_id ON request_reminders (ref_id);
CREATE INDEX idx_flatmate_group_applications_applicant ON flatmate_group_applications (applicant_id);
