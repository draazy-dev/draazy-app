-- anchor_at is in the key so an item that re-enters a queue (resubmitted listing, next rent-agreement stage) re-arms.
CREATE TABLE staff_alert_log (
    rule      text        NOT NULL,
    item_id   text        NOT NULL,
    level     text        NOT NULL CHECK (level IN ('arrival', 'reminder', 'escalation')),
    anchor_at timestamptz NOT NULL,
    sent_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (rule, item_id, level, anchor_at)
);

CREATE INDEX idx_staff_alert_log_sent ON staff_alert_log (sent_at);
