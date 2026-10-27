CREATE INDEX IF NOT EXISTS idx_error_event_first_seen ON error_event (first_seen);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_identity_conflicts_created_at ON identity_conflicts (created_at);

CREATE INDEX IF NOT EXISTS idx_invoices_issued_at ON invoices (issued_at);
CREATE INDEX IF NOT EXISTS idx_credit_notes_issued_at ON credit_notes (issued_at);