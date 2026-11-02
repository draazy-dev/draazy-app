CREATE INDEX idx_properties_pending_review ON properties (coalesce(resubmitted_at, created_at))
    WHERE status = 'pending' AND archived = false;
