ALTER TABLE managed_properties
    ADD COLUMN source_room_id     uuid REFERENCES flatmate_rooms (id) ON DELETE SET NULL,
    ADD COLUMN address_fingerprint text;

-- Backstop for the insert-on-conflict that saves the owner's home when a tenant's room in it is agreed: one private
-- home per owner and flat, however many rooms of that flat get confirmed.
CREATE UNIQUE INDEX idx_managed_properties_owner_flat
    ON managed_properties (owner_id, address_fingerprint)
    WHERE address_fingerprint IS NOT NULL;

CREATE INDEX idx_managed_properties_source_room ON managed_properties (source_room_id)
    WHERE source_room_id IS NOT NULL;
