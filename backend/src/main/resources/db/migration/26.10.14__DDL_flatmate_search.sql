-- Flatmate search: per-head price and indexes so /flatmates/feed filters, counts and pages in the database.
-- A room's per-head price is not stored (it depends on sibling rooms in the flat); FlatmateSearchQueries computes it.

-- Group lat/lng stay null for most rows, so radius search must not require them: appendRadius falls back to the
-- locality centroid. Null means unknown, never 0.
COMMENT ON COLUMN flatmate_groups.lat IS
    'Latitude of the group''s flat, null while the group has no address yet -- which is most of '
    'them. Null means unknown, never 0; radius search falls back to the locality centroid.';
COMMENT ON COLUMN flatmate_groups.lng IS
    'Longitude of the group''s flat, null while the group has no address yet. Null means unknown '
    'and is excluded from radius search rather than treated as 0.';

-- round(), not integer division, so a group priced at a user's ceiling cannot drop out of its own range.
COMMENT ON COLUMN flatmate_groups.per_head IS
    'What one member pays: round(rent / seats_total). Generated, so it can never drift from the '
    'two columns it summarises. This is the number budget filters compare against, not `rent`.';

CREATE INDEX idx_flatmate_groups_per_head ON flatmate_groups (per_head)
    WHERE archived = false;

-- Habits are an AND over tags (jsonb @>); jsonb_path_ops is smaller and supports the only operator needed.
CREATE INDEX idx_flatmate_rooms_tags ON flatmate_rooms USING gin (tags jsonb_path_ops)
    WHERE archived = false;

CREATE INDEX idx_flatmate_groups_tags ON flatmate_groups USING gin (tags jsonb_path_ops)
    WHERE archived = false;

CREATE INDEX idx_flatmate_seeker_posts_tags ON flatmate_seeker_posts USING gin (tags jsonb_path_ops)
    WHERE archived = false;

-- Partial on the feed predicate: archived or unmoderated rows never appear in a search result.
CREATE INDEX idx_flatmate_rooms_available_from ON flatmate_rooms (available_from)
    WHERE archived = false AND mod_status IN ('live','approved');

CREATE INDEX idx_flatmate_seeker_posts_move_in_at ON flatmate_seeker_posts (move_in_at)
    WHERE archived = false AND mod_status IN ('live','approved');

-- The unpartitioned budget index is kept: it serves the admin board, which wants archived rows.
CREATE INDEX idx_flatmate_seeker_posts_gender ON flatmate_seeker_posts (gender)
    WHERE archived = false AND mod_status IN ('live','approved');

CREATE INDEX idx_flatmate_rooms_gender ON flatmate_rooms (gender)
    WHERE archived = false AND mod_status IN ('live','approved');
