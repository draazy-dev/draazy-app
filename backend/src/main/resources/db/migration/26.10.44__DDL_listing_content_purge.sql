ALTER TABLE properties
    -- Set only when the owner deletes; staff takedowns stay intact as evidence.
    ADD COLUMN purge_after timestamptz,
    ADD COLUMN content_purged_at timestamptz;

CREATE INDEX idx_properties_purge_due ON properties (purge_after)
    WHERE purge_after IS NOT NULL AND content_purged_at IS NULL;

-- Listings the owner deleted before this existed get the full undo window from today.
UPDATE properties SET purge_after = now() + interval '30 days'
WHERE archived AND archive_reason = 'Taken down by the owner';
