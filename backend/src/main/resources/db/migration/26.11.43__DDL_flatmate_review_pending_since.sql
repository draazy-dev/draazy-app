ALTER TABLE flatmate_reviews ADD COLUMN pending_since timestamptz;

-- created_at is the anchor the SLA log already holds for these rows, so none is announced twice.
UPDATE flatmate_reviews SET pending_since = created_at;

ALTER TABLE flatmate_reviews
    ALTER COLUMN pending_since SET NOT NULL,
    ALTER COLUMN pending_since SET DEFAULT now();

COMMENT ON COLUMN flatmate_reviews.pending_since IS
    'When the review last entered pending: set on creation and on each reopen from a decision, never by an '
    'edit while it is already pending. The staff SLA anchors on it, and its alert log is keyed by the anchor, '
    'so a reopened review starts a fresh announce/remind/escalate cycle instead of matching the old one.';
