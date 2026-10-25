-- A spare room's occupants is the whole flat's headcount; only a split room's counts people in that room (max 3).
ALTER TABLE flatmate_rooms DROP CONSTRAINT IF EXISTS flatmate_rooms_occupants_check;
ALTER TABLE flatmate_rooms ADD CONSTRAINT flatmate_rooms_occupants_check
    CHECK (occupants BETWEEN 0 AND 10 AND (property_id IS NULL OR occupants <= 3));
