ALTER TABLE contact_requests ADD COLUMN first_requested_at timestamptz;
UPDATE contact_requests SET first_requested_at = created_at;
ALTER TABLE contact_requests
    ALTER COLUMN first_requested_at SET DEFAULT now(),
    ALTER COLUMN first_requested_at SET NOT NULL;
COMMENT ON COLUMN contact_requests.first_requested_at IS
    'When the asker first spent this contact. Written once; created_at moves when a pending ask is renewed, this never does, so the quota windows cannot be restarted or recharged by a renewal.';
