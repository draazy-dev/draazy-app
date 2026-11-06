-- One text column, not a foreign key per kind: the subject is a property, a flatmate room/group/post or an
-- invoice number, and the owner check lives in SupportTicketAbouts.
ALTER TABLE support_tickets
    ADD COLUMN about_type text
        CHECK (about_type IN ('property','flatmate_room','flatmate_group','flatmate_post','invoice')),
    ADD COLUMN about_id text,
    ADD CONSTRAINT support_tickets_about_pair CHECK ((about_type IS NULL) = (about_id IS NULL));

-- One open thread per subject: the in-chat topic picker resumes it rather than opening a duplicate.
CREATE UNIQUE INDEX uq_support_tickets_open_about ON support_tickets (user_id, about_type, about_id)
    WHERE about_type IS NOT NULL AND status NOT IN ('resolved','closed');
