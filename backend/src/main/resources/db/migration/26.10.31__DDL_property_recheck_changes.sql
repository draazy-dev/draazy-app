-- What each re-check-raising owner edit changed, as [{field, before, after}] for the staff reviewer;
-- cleared with recheck_reason.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS recheck_changes jsonb;
